import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMemo } from "react";
import { create } from "zustand";

import { listHouseholds, syncHousehold, type HouseholdSummary } from "./api";
import {
  applyLocalChange,
  applySyncResponse,
  emptyState,
  takePending,
  type HouseholdState,
} from "./syncCore";
import type { Entity, EntityData, SyncRow } from "./types";

const ACTIVE_KEY = "pantry.activeHousehold";
const householdKey = (id: string) => `pantry.household.${id}`;

async function readState(id: string): Promise<HouseholdState> {
  try {
    const raw = await AsyncStorage.getItem(householdKey(id));
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<HouseholdState>;
    if (
      typeof parsed.cursor !== "number" ||
      !parsed.rows ||
      typeof parsed.rows !== "object" ||
      !parsed.pending ||
      typeof parsed.pending !== "object"
    ) {
      return emptyState();
    }
    return {
      cursor: parsed.cursor,
      rows: parsed.rows as Record<string, SyncRow>,
      pending: parsed.pending as Record<string, SyncRow>,
    };
  } catch {
    return emptyState();
  }
}

async function writeState(id: string, state: HouseholdState): Promise<void> {
  await AsyncStorage.setItem(householdKey(id), JSON.stringify(state));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Sync failed.";
}

interface HouseholdStore {
  households: HouseholdSummary[];
  activeId: string | null;
  state: HouseholdState;
  syncing: boolean;
  lastError: string | null;
  loadHouseholds: () => Promise<void>;
  setActive: (id: string) => Promise<void>;
  clear: () => void;
  upsert: <E extends Entity>(entity: E, rowId: string, data: EntityData[E]) => void;
  remove: (entity: Entity, rowId: string) => void;
  sync: () => Promise<void>;
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncOwner: string | null = null;

function scheduleSync(): void {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void useHouseholdStore.getState().sync();
  }, 1_000);
}

export const useHouseholdStore = create<HouseholdStore>((set, get) => ({
  households: [],
  activeId: null,
  state: emptyState(),
  syncing: false,
  lastError: null,

  loadHouseholds: async () => {
    try {
      const households = await listHouseholds();
      const saved = await AsyncStorage.getItem(ACTIVE_KEY);
      const activeId =
        (saved && households.some((household) => household.id === saved) ? saved : null) ??
        households[0]?.id ??
        null;
      // activeId and state change together, so a sync never pushes one household's rows to another.
      const state = activeId ? await readState(activeId) : emptyState();
      set({ households, activeId, state, lastError: null });
      if (activeId) await AsyncStorage.setItem(ACTIVE_KEY, activeId);
      else await AsyncStorage.removeItem(ACTIVE_KEY);
    } catch (error) {
      set({ lastError: messageOf(error) });
    }
  },

  setActive: async (id) => {
    if (get().activeId === id) return;
    const state = await readState(id);
    set({ activeId: id, state, lastError: null });
    await AsyncStorage.setItem(ACTIVE_KEY, id);
    await get().sync();
  },

  clear: () => {
    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }
    syncOwner = null;
    set({
      households: [],
      activeId: null,
      state: emptyState(),
      syncing: false,
      lastError: null,
    });
  },

  upsert: (entity, rowId, data) => {
    const id = get().activeId;
    if (!id) return;
    const row: SyncRow = {
      entity,
      rowId,
      data: data as unknown as Record<string, unknown>,
      deleted: false,
      updatedAt: new Date().toISOString(),
    };
    const state = applyLocalChange(get().state, row);
    set({ state });
    void writeState(id, state).catch(() => undefined);
    scheduleSync();
  },

  remove: (entity, rowId) => {
    const id = get().activeId;
    if (!id) return;
    const row: SyncRow = {
      entity,
      rowId,
      data: {},
      deleted: true,
      updatedAt: new Date().toISOString(),
    };
    const state = applyLocalChange(get().state, row);
    set({ state });
    void writeState(id, state).catch(() => undefined);
    scheduleSync();
  },

  sync: async () => {
    const id = get().activeId;
    if (!id || (get().syncing && syncOwner === id)) return;
    set({ syncing: true, lastError: null });
    syncOwner = id;
    try {
      let more = false;
      do {
        const state = get().state;
        const sent = takePending(state);
        const response = await syncHousehold(id, { cursor: state.cursor, rows: sent });
        if (get().activeId !== id) return;

        // Re-read so an edit made while the request was in flight is not lost.
        const merged = applySyncResponse(get().state, sent, response);
        set({ state: merged });
        await writeState(id, merged);
        if (get().activeId !== id) return;
        more = response.more;
      } while (Object.keys(get().state.pending).length > 0 || more);
    } catch (error) {
      if (get().activeId === id) set({ lastError: messageOf(error) });
    } finally {
      if (syncOwner === id) {
        syncOwner = null;
        set({ syncing: false });
      }
    }
  },
}));

type RowWithId<E extends Entity> = { id: string } & EntityData[E];

export function useRows<E extends Entity>(entity: E): RowWithId<E>[] {
  const rows = useHouseholdStore((store) => store.state.rows);
  return useMemo(
    () =>
      Object.values(rows)
        .filter((row) => row.entity === entity && !row.deleted)
        .map((row) => ({
          id: row.rowId,
          ...(row.data as unknown as EntityData[E]),
        })) as RowWithId<E>[],
    [rows, entity],
  );
}

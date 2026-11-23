import { describe, expect, test } from "vite-plus/test";
import { boundingBox, distanceKm, parseGymProposal } from "./gyms";

const valid = {
  name: " Iron Den ",
  address: "",
  latitude: 3.139,
  longitude: 101.6869,
  equipment: ["Barbell", " barbell ", "Cable  machine", ""],
};

describe("parseGymProposal", () => {
  test("normalizes name, empty address and duplicate equipment", () => {
    expect(parseGymProposal(valid)).toEqual({
      name: "Iron Den",
      address: null,
      latitude: 3.139,
      longitude: 101.6869,
      equipment: ["Barbell", "Cable machine"],
    });
  });

  test.each([
    [{ ...valid, name: "x" }, "Gym name"],
    [{ ...valid, latitude: 91 }, "Latitude"],
    [{ ...valid, longitude: "1" }, "Longitude"],
    [{ ...valid, equipment: "Barbell" }, "Equipment must be a list"],
    [{ ...valid, equipment: Array.from({ length: 101 }, (_, i) => `item ${i}`) }, "at most 100"],
    [null, "must be an object"],
  ])("rejects %j", (input, message) => {
    expect(() => parseGymProposal(input)).toThrow(message);
  });
});

describe("geo helpers", () => {
  test("bounding box contains points within the radius", () => {
    const box = boundingBox(3.139, 101.6869, 5);
    expect(box.minLat).toBeLessThan(3.139);
    expect(box.maxLng).toBeGreaterThan(101.6869);
    expect(
      distanceKm(
        { latitude: 3.139, longitude: 101.6869 },
        { latitude: box.maxLat, longitude: 101.6869 },
      ),
    ).toBeCloseTo(5, 1);
  });
});

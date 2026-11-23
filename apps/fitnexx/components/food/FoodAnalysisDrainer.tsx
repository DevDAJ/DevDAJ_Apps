import * as Network from "expo-network";
import { useEffect } from "react";
import { AppState } from "react-native";
import { drainFoodAnalysisQueue } from "../../lib/foodAnalysisQueue";
import { useAuth } from "../auth/AuthProvider";

/** Runs the food-analysis queue while the app is active. No background task. */
export function FoodAnalysisDrainer() {
  const userId = useAuth().user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    void drainFoodAnalysisQueue({ ownerId: userId }).catch(() => undefined);
    const appSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void drainFoodAnalysisQueue({ ownerId: userId }).catch(() => undefined);
      }
    });
    const netSub = Network.addNetworkStateListener((state) => {
      if (state.isInternetReachable ?? state.isConnected) {
        void drainFoodAnalysisQueue({ ownerId: userId }).catch(() => undefined);
      }
    });
    return () => {
      appSub.remove();
      netSub.remove();
    };
  }, [userId]);

  return null;
}

import { Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { apiErrorMessage } from "./jolt";
import { JOLT_UNAVAILABLE_MESSAGE } from "./jolt/errors";
import { enterSpokeRuntime, type SpokeStartupCompatibility } from "./startup";

type SpokeStartupState =
  | SpokeStartupCompatibility
  | { status: "checking" }
  | { status: "error"; message: string };

function startupCopy(startup: SpokeStartupState) {
  switch (startup.status) {
    case "compatible":
      return null;
    case "checking":
      return {
        title: "Checking Jolt compatibility",
        message: "Spoke is checking the generic App API behavior provided by your local Jolt daemon."
      };
    case "incompatible":
      return {
        title: "Spoke needs a newer Jolt",
        message:
          "This Spoke build requires Jolt behavior that the connected daemon does not provide. Spoke stopped before opening a session or changing data."
      };
    case "unavailable":
      return { title: "Jolt is unavailable", message: JOLT_UNAVAILABLE_MESSAGE };
    case "error":
      return { title: "Could not check Jolt compatibility", message: startup.message };
  }
}

export function SpokeStartupGate({ children }: { children: ReactNode }) {
  const [startup, setStartup] = useState<SpokeStartupState>({ status: "checking" });
  const [retrying, setRetrying] = useState(false);

  async function checkCompatibility() {
    setRetrying(true);
    try {
      const compatibility = await enterSpokeRuntime(async () => undefined);
      setStartup(compatibility);
    } catch (error) {
      setStartup({ status: "error", message: apiErrorMessage(error) });
    } finally {
      setRetrying(false);
    }
  }

  useEffect(() => {
    void checkCompatibility();
  }, []);

  const copy = startupCopy(startup);
  if (!copy) {
    return children;
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5" />
            {copy.title}
          </CardTitle>
          <CardDescription>{copy.message}</CardDescription>
        </CardHeader>
        {startup.status !== "checking" ? (
          <CardFooter>
            <Button type="button" onClick={() => void checkCompatibility()} disabled={retrying}>
              {retrying ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Check again
            </Button>
          </CardFooter>
        ) : null}
      </Card>
    </main>
  );
}

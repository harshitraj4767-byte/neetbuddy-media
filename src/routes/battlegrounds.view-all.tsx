import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/battlegrounds/view-all")({
  beforeLoad: () => {
    throw redirect({ to: "/battlegrounds/history" });
  },
});
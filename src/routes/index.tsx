import { createFileRoute } from "@tanstack/react-router";
import { BenchDesk } from "@/components/bench/BenchDesk";

export const Route = createFileRoute("/")({ component: BenchDesk });

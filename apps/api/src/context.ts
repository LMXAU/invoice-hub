import type { Bindings } from "./bindings";

export type AppEnv = {
  Bindings: Bindings;
  Variables: {
    requestId: string;
    user?: {
      id: string;
      email: string;
      role: "admin" | "user";
    };
  };
};

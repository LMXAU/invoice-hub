export type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
  ENVIRONMENT: "development" | "staging" | "production";
};

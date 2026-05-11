import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  S3_BUCKET: z.string().min(1).optional(),
  S3_REGION: z.string().min(1).optional(),
  S3_ENDPOINT: z.string().min(1).optional(),
  S3_KEY: z.string().min(1).optional(),
  S3_SECRET: z.string().min(1).optional(),
  S3_PUBLIC_BASE_URL: z.string().min(1).optional(),
  S3_PREFIX: z.string().min(1).default("mcp-gost-documents"),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_MODEL: z.string().min(1).default("openrouter/auto"),
});

export type AppEnv = z.infer<typeof envSchema>;

export type S3Config = {
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
  prefix: string;
};

export type OpenRouterConfig = {
  apiKey: string;
  model: string;
};

export function loadEnv(input: NodeJS.ProcessEnv = process.env): AppEnv {
  return envSchema.parse(input);
}

export function getS3Config(env: AppEnv): S3Config {
  const missing = [
    ["S3_BUCKET", env.S3_BUCKET],
    ["S3_REGION", env.S3_REGION],
    ["S3_ENDPOINT", env.S3_ENDPOINT],
    ["S3_KEY", env.S3_KEY],
    ["S3_SECRET", env.S3_SECRET],
    ["S3_PUBLIC_BASE_URL", env.S3_PUBLIC_BASE_URL],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing S3 environment variables: ${missing.join(", ")}`);
  }

  return {
    bucket: env.S3_BUCKET!,
    region: env.S3_REGION!,
    endpoint: env.S3_ENDPOINT!,
    accessKeyId: env.S3_KEY!,
    secretAccessKey: env.S3_SECRET!,
    publicBaseUrl: env.S3_PUBLIC_BASE_URL!,
    prefix: env.S3_PREFIX,
  };
}

export function getOpenRouterConfig(env: AppEnv): OpenRouterConfig {
  if (!env.OPENROUTER_API_KEY) {
    throw new Error("Missing OPENROUTER_API_KEY environment variable.");
  }

  return {
    apiKey: env.OPENROUTER_API_KEY,
    model: env.OPENROUTER_MODEL,
  };
}

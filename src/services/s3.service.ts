import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { S3Config } from "../config/env.js";

export type UploadedFile = {
  name: string;
  key: string;
  url: string;
  contentType: string;
  size: number;
};

export type S3Artifact = {
  name: string;
  key: string;
  uri: string;
  contentType?: string;
  size?: number;
};

export class S3Service {
  private readonly s3: S3Client;

  constructor(private readonly config: S3Config) {
    this.s3 = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async uploadText(
    projectId: string,
    fileName: string,
    text: string,
    contentType = "text/plain; charset=utf-8"
  ): Promise<UploadedFile> {
    return this.uploadBuffer(projectId, fileName, Buffer.from(text), contentType);
  }

  async uploadJson(
    projectId: string,
    fileName: string,
    value: unknown
  ): Promise<UploadedFile> {
    return this.uploadText(
      projectId,
      fileName,
      JSON.stringify(value, null, 2),
      "application/json; charset=utf-8"
    );
  }

  async uploadPdf(projectId: string, body: Buffer): Promise<UploadedFile> {
    return this.uploadBuffer(projectId, "main.pdf", body, "application/pdf");
  }

  async uploadBuffer(
    projectId: string,
    fileName: string,
    body: Buffer,
    contentType: string
  ): Promise<UploadedFile> {
    const key = this.buildKey(projectId, fileName);

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentLength: body.length,
      })
    );

    return {
      name: fileName,
      key,
      url: this.buildPublicUrl(key),
      contentType,
      size: body.length,
    };
  }

  async readText(projectId: string, fileName: string): Promise<string> {
    const body = await this.readBuffer(projectId, fileName);
    return body.toString("utf8");
  }

  async readBuffer(projectId: string, fileName: string): Promise<Buffer> {
    const key = this.buildKey(projectId, fileName);
    const response = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      })
    );

    if (!response.Body) {
      throw new Error(`S3 object has empty body: ${key}`);
    }

    return this.streamToBuffer(response.Body);
  }

  async headArtifact(projectId: string, fileName: string): Promise<S3Artifact> {
    const key = this.buildKey(projectId, fileName);
    const response = await this.s3.send(
      new HeadObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      })
    );

    return {
      name: fileName,
      key,
      uri: this.buildPublicUrl(key),
      contentType: response.ContentType,
      size: response.ContentLength,
    };
  }

  async listArtifacts(projectId: string): Promise<S3Artifact[]> {
    const prefix = this.buildProjectPrefix(projectId);
    const response = await this.s3.send(
      new ListObjectsV2Command({
        Bucket: this.config.bucket,
        Prefix: prefix,
      })
    );

    return (response.Contents ?? [])
      .filter((object) => object.Key)
      .map((object) => {
        const key = object.Key!;
        return {
          name: key.slice(prefix.length),
          key,
          uri: this.buildPublicUrl(key),
          size: object.Size,
        };
      })
      .filter((artifact) => artifact.name.length > 0);
  }

  buildKey(projectId: string, fileName: string): string {
    return `${this.buildProjectPrefix(projectId)}${fileName}`;
  }

  buildPublicUrl(key: string): string {
    const baseUrl = this.config.publicBaseUrl.replace(/\/+$/g, "");
    const encodedKey = key.split("/").map(encodeURIComponent).join("/");
    return `${baseUrl}/${encodedKey}`;
  }

  private buildProjectPrefix(projectId: string): string {
    const prefix = this.config.prefix.replace(/^\/+|\/+$/g, "");
    return `${[prefix, projectId].filter(Boolean).join("/")}/`;
  }

  private async streamToBuffer(body: unknown): Promise<Buffer> {
    if (
      body &&
      typeof body === "object" &&
      "transformToByteArray" in body &&
      typeof body.transformToByteArray === "function"
    ) {
      return Buffer.from(await body.transformToByteArray());
    }

    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Buffer | Uint8Array | string>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  }
}

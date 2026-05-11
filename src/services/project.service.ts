import path from "node:path";
import type { GostDocument } from "../schemas.js";
import type { S3Artifact, S3Service, UploadedFile } from "./s3.service.js";

export type ProjectArtifact = {
  name: string;
  key: string;
  uri: string;
  contentType?: string;
  size?: number;
};

export class ProjectService {
  constructor(private readonly s3Service: S3Service) {}

  async writeProjectFiles(
    projectId: string,
    typContent: string,
    input: GostDocument
  ): Promise<{
    storagePrefix: string;
    typ: UploadedFile;
    json: UploadedFile;
  }> {
    const [typ, json] = await Promise.all([
      this.s3Service.uploadText(
        projectId,
        "main.typ",
        typContent,
        "text/plain; charset=utf-8"
      ),
      this.s3Service.uploadJson(projectId, "document.json", input),
    ]);

    return {
      storagePrefix: path.posix.dirname(typ.key),
      typ,
      json,
    };
  }

  async listArtifacts(projectId: string): Promise<ProjectArtifact[]> {
    const artifacts = await this.s3Service.listArtifacts(projectId);
    return artifacts.map((artifact) => this.toProjectArtifact(artifact));
  }

  async readTextArtifact(projectId: string, fileName: string): Promise<string> {
    if (fileName !== path.basename(fileName)) {
      throw new Error("Nested file paths are not allowed.");
    }

    return this.s3Service.readText(projectId, fileName);
  }

  async readTypstSource(projectId: string): Promise<string> {
    return this.readTextArtifact(projectId, "main.typ");
  }

  async saveCompiledPdf(
    projectId: string,
    pdf: Buffer
  ): Promise<UploadedFile> {
    return this.s3Service.uploadPdf(projectId, pdf);
  }

  async getArtifact(projectId: string, fileName: string): Promise<ProjectArtifact> {
    const artifact = await this.s3Service.headArtifact(projectId, fileName);
    return this.toProjectArtifact(artifact);
  }

  private toProjectArtifact(artifact: S3Artifact): ProjectArtifact {
    return {
      name: artifact.name,
      key: artifact.key,
      uri: artifact.uri,
      contentType: artifact.contentType,
      size: artifact.size,
    };
  }
}

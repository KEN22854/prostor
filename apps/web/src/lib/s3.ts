import 'server-only';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '@/lib/env';

const globalForS3 = globalThis as unknown as { __s3?: S3Client };

/** S3-клиент (SeaweedFS локально, R2/S3/Yandex Object Storage в проде) */
export function s3(): S3Client {
  if (!globalForS3.__s3) {
    const e = env();
    globalForS3.__s3 = new S3Client({
      endpoint: e.S3_ENDPOINT,
      region: e.S3_REGION,
      forcePathStyle: e.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: e.S3_ACCESS_KEY, secretAccessKey: e.S3_SECRET_KEY },
    });
  }
  return globalForS3.__s3;
}

export async function putObject(key: string, body: Uint8Array, contentType: string): Promise<void> {
  await s3().send(
    new PutObjectCommand({
      Bucket: env().S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export interface ObjectStream {
  body: ReadableStream<Uint8Array>;
  contentLength: number | undefined;
  /** Ответ на запрос части файла: «bytes 0-99/1234» */
  contentRange?: string;
}

/** range — заголовок HTTP Range («bytes=0-»): перемотка аудио и видео */
export async function getObjectStream(key: string, range?: string): Promise<ObjectStream | null> {
  try {
    const res = await s3().send(
      new GetObjectCommand({
        Bucket: env().S3_BUCKET,
        Key: key,
        ...(range ? { Range: range } : {}),
      }),
    );
    if (!res.Body) return null;
    return {
      body: res.Body.transformToWebStream(),
      contentLength: res.ContentLength,
      contentRange: res.ContentRange,
    };
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      error.name === 'NoSuchKey'
    )
      return null;
    throw error;
  }
}

import multer from "multer";
import path from "node:path";
import { randomUUID } from "node:crypto";
import fs from "node:fs";

const uploadDirectory =
  process.env.UPLOAD_DIR ?? path.resolve(process.cwd(), "..", "uploads");
const maxFileSizeMb = Number(process.env.MAX_FILE_SIZE_MB ?? 25);
const allowedMimeTypes = (
  process.env.ALLOWED_AUDIO_TYPES ??
  "audio/mpeg,audio/wav,audio/webm,audio/mp4,audio/ogg"
)
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

if (!fs.existsSync(uploadDirectory)) {
  fs.mkdirSync(uploadDirectory, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadDirectory);
  },
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname) || ".tmp";
    callback(null, `${randomUUID()}${extension}`);
  },
});

function fileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback,
): void {
  if (!allowedMimeTypes.includes(file.mimetype)) {
    callback(new Error("Unsupported file type"));
    return;
  }

  callback(null, true);
}

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: maxFileSizeMb * 1024 * 1024,
  },
});

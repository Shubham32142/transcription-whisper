import multer from "multer";
import path from "node:path";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { config } from "../config";
import { logger } from "../config/logger";
import { isAllowedUpload } from "../utils/fileValidation";

const uploadDirectory =
  config.upload.dir ?? path.resolve(process.cwd(), "..", "uploads");
const hardMaxFileSizeMb = config.upload.hardMaxFileSizeMb;

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
  if (!isAllowedUpload(file.mimetype, file.originalname)) {
    logger.warn("Rejected upload: unsupported file type", {
      mimetype: file.mimetype,
      originalname: file.originalname,
      extension: path.extname(file.originalname || "").toLowerCase(),
    });
    callback(new Error("Unsupported file type"));
    return;
  }

  callback(null, true);
}

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: hardMaxFileSizeMb * 1024 * 1024,
  },
});

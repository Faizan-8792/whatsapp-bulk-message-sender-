const fs = require("fs");
const path = require("path");
const multer = require("multer");
const env = require("../config/env");

const baseUploadDir = path.resolve(process.cwd(), env.uploadDir);
const contactUploadDir = path.join(baseUploadDir, "contacts");
const imageUploadDir = path.join(baseUploadDir, "campaigns");

[baseUploadDir, contactUploadDir, imageUploadDir].forEach((dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

function sanitizeFileName(fileName) {
  return fileName.replace(/[^\w.-]/g, "_");
}

const contactStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, contactUploadDir),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    cb(null, `${timestamp}_${sanitizeFileName(file.originalname)}`);
  },
});

const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, imageUploadDir),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    cb(null, `${timestamp}_${sanitizeFileName(file.originalname)}`);
  },
});

function contactFileFilter(req, file, cb) {
  const allowedExt = [".csv", ".xlsx", ".xls"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowedExt.includes(ext)) {
    cb(new Error("Only CSV and XLSX files are supported"));
    return;
  }
  cb(null, true);
}

function imageFileFilter(req, file, cb) {
  const allowedMimeTypes = [
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/gif",
  ];
  if (!allowedMimeTypes.includes(file.mimetype)) {
    cb(new Error("Only image files are supported"));
    return;
  }
  cb(null, true);
}

const maxSize = env.maxFileSizeMb * 1024 * 1024;

const contactUpload = multer({
  storage: contactStorage,
  fileFilter: contactFileFilter,
  limits: { fileSize: maxSize },
});

const imageUpload = multer({
  storage: imageStorage,
  fileFilter: imageFileFilter,
  limits: { fileSize: maxSize },
});

module.exports = {
  contactUpload,
  imageUpload,
};

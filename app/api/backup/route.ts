import { NextResponse } from "next/server";
import { backupsDir, getDbKeyHex, getEncryptionStatus, getSqlite } from "@/lib/db";
import { listBackups, rotateBackups, runBackup } from "@/lib/backup/engine";

export async function GET() {
  return NextResponse.json({
    encryption: getEncryptionStatus(),
    backups: listBackups(backupsDir),
  });
}

export async function POST() {
  const run = runBackup(getSqlite(), getDbKeyHex(), backupsDir);
  const rotated = rotateBackups(backupsDir);
  return NextResponse.json(
    {
      fileName: run.fileName,
      sizeBytes: run.sizeBytes,
      verify: run.verify,
      rotatedOut: rotated,
    },
    { status: run.verify.ok ? 200 : 500 },
  );
}

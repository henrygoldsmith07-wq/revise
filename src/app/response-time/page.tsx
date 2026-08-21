"use client";

import { ResponseTimeCalibrationPanel } from "@/components/ResponseTimeCalibration";

export default function ResponseTimePage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Exam technique</p>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight mt-1">Response-Time Calibration</h1>
        <p className="text-sm text-ink3 mt-1 max-w-2xl">
          Learn whether your speed is helping or hiding marks. Revise compares the time you spend with the marks available, then checks whether the answers earned those marks.
        </p>
      </header>

      <ResponseTimeCalibrationPanel />
    </div>
  );
}

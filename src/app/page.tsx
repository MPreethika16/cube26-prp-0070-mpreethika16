"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import Image from "next/image";
import type { WorkOrderSpecification } from "@/lib/compliance/work-order.schema";
import type { OperationalInspectionSummary } from "@/lib/inspection/operational-status";
import { type EnrichedComplianceCheck } from "@/lib/inspection/inspection-view-model";
import type { EvidenceRecoveryPlan } from "@/lib/recovery/recovery-action.schema";
import type { PrepUnitObservation } from "@/lib/vision/prep-observation.schema";
import { evaluateEvidenceReadiness } from "@/lib/evidence-quality/evaluate-evidence-readiness";
import {
  PHOTO_CAPTURE_GUIDANCE,
  CHECK_HUMAN_TITLES,
  translateErrorToHuman,
  getOrderedOperatorProblems,
  type SlotId,
} from "@/lib/inspection/operator-presentation";

interface ImageSlotState {
  imageId: SlotId;
  name: string;
  dataUrl: string | null;
  mimeType: string;
  filename: string | null;
}

const INITIAL_SLOTS: Record<SlotId, ImageSlotState> = {
  front: {
    imageId: "front",
    name: "Front",
    dataUrl: null,
    mimeType: "image/jpeg",
    filename: null,
  },
  back: {
    imageId: "back",
    name: "Back",
    dataUrl: null,
    mimeType: "image/jpeg",
    filename: null,
  },
  label: {
    imageId: "label",
    name: "Label",
    dataUrl: null,
    mimeType: "image/jpeg",
    filename: null,
  },
};

const SAMPLE_UNITS = [
  {
    unitId: "SAMPLE-01",
    label: "Sample A — Protein Snack",
    description: "Straight-through inspection",
  },
  {
    unitId: "SAMPLE-02",
    label: "Sample B — Tech Pouch",
    description: "Physical defect correction loop",
  },
  {
    unitId: "SAMPLE-03",
    label: "Sample C — Organic Tea",
    description: "Evidence recovery journey",
  },
];

const LOADING_STEPS = [
  "Checking photos",
  "Analyzing prep",
  "Verifying requirements",
];

export default function OperatorInspectionPage() {
  const [selectedUnitId, setSelectedUnitId] = useState<string>("SAMPLE-01");
  const [unitInput, setUnitInput] = useState<string>("SAMPLE-01");
  const [unitMode, setUnitMode] = useState<"DEMO_SAMPLE" | "MANUAL_UNIT">("DEMO_SAMPLE");
  const [workOrder, setWorkOrder] = useState<WorkOrderSpecification | null>(null);
  const [woLoading, setWoLoading] = useState<boolean>(false);
  const [woError, setWoError] = useState<string | null>(null);

  const [slots, setSlots] = useState<Record<SlotId, ImageSlotState>>(INITIAL_SLOTS);
  const [isFixtureLoading, setIsFixtureLoading] = useState<boolean>(false);

  const [isInspecting, setIsInspecting] = useState<boolean>(false);
  const [activeStageIdx, setActiveStageIdx] = useState<number>(0);
  const [inspectionError, setInspectionError] = useState<string | null>(null);

  const [operationalStatus, setOperationalStatus] =
    useState<OperationalInspectionSummary | null>(null);
  const [enrichedChecks, setEnrichedChecks] = useState<EnrichedComplianceCheck[]>([]);
  const [latestObservation, setLatestObservation] = useState<PrepUnitObservation | null>(null);
  const [recoveryPlan, setRecoveryPlan] = useState<EvidenceRecoveryPlan | null>(null);
  const [routingDecision, setRoutingDecision] = useState<string | null>(null);
  const [inspectionIteration, setInspectionIteration] = useState<number>(0);
  const [metadata, setMetadata] = useState<{
    model?: string;
    durationMs?: number;
    inspectedAt?: string;
  } | null>(null);

  // Track previous check verdicts for transition display (e.g. UNCERTAIN -> PASS)
  const [previousVerdicts, setPreviousVerdicts] = useState<
    Record<string, "PASS" | "FAIL" | "UNCERTAIN" | null>
  >({});

  // Human-First Navigation & Problem State (One Problem at a Time)
  const [activeProblemIndex, setActiveProblemIndex] = useState<number>(0);
  const [showAllProblems, setShowAllProblems] = useState<boolean>(false);
  const [expandedWhyTasks, setExpandedWhyTasks] = useState<Record<string, boolean>>({});

  // UI accordion and modal states
  const [showPassedChecks, setShowPassedChecks] = useState<boolean>(false);
  const [showWhyDecision, setShowWhyDecision] = useState<boolean>(false);
  const [newPhotoReady, setNewPhotoReady] = useState<boolean>(false);
  const [previewImage, setPreviewImage] = useState<{ title: string; src: string } | null>(
    null
  );

  const fileInputRefs = {
    front: useRef<HTMLInputElement>(null),
    back: useRef<HTMLInputElement>(null),
    label: useRef<HTMLInputElement>(null),
  };

  // Track active unit loading request to prevent async race condition contamination
  const activeRequestIdRef = useRef<number>(0);

  // Reset all inspection state (ensures zero outcome leakage when switching units)
  const resetInspectionState = () => {
    setWorkOrder(null);
    setOperationalStatus(null);
    setEnrichedChecks([]);
    setLatestObservation(null);
    setRecoveryPlan(null);
    setRoutingDecision(null);
    setInspectionIteration(0);
    setPreviousVerdicts({});
    setInspectionError(null);
    setShowPassedChecks(false);
    setShowWhyDecision(false);
    setNewPhotoReady(false);
    setActiveProblemIndex(0);
    setShowAllProblems(false);
    setExpandedWhyTasks({});
  };

  // General Unit Loader (Loads work order and physical fixtures without leaking verdicts or context)
  const handleLoadUnit = async (
    unitIdToLoad: string,
    mode: "DEMO_SAMPLE" | "MANUAL_UNIT" = "MANUAL_UNIT"
  ) => {
    const normId = unitIdToLoad.trim().toUpperCase();
    if (!normId) return;

    const currentRequestId = ++activeRequestIdRef.current;

    setUnitMode(mode);
    resetInspectionState();
    setSelectedUnitId(normId);
    setUnitInput(normId);
    setWoError(null);
    setWoLoading(true);

    try {
      const woRes = await fetch(
        `/api/work-orders?unitId=${encodeURIComponent(normId)}`
      );
      const woData = await woRes.json();

      // If a newer unit was requested while this was in flight, discard stale response
      if (activeRequestIdRef.current !== currentRequestId) return;

      if (!woRes.ok || !woData.workOrder) {
        throw new Error(
          woData.error ||
            `Work order not found for "${normId}". Enter a unit available in the loaded work-order dataset.`
        );
      }
      setWorkOrder(woData.workOrder);

      // Load fixture photographs if available on disk for this unit
      setIsFixtureLoading(true);
      try {
        const fixRes = await fetch(
          `/api/fixtures?unitId=${encodeURIComponent(normId)}&variant=default`
        );
        if (activeRequestIdRef.current !== currentRequestId) return;

        if (fixRes.ok) {
          const fixData = await fixRes.json();
          if (activeRequestIdRef.current !== currentRequestId) return;

          if (fixData.images && fixData.images.length > 0) {
            const newSlots = { ...INITIAL_SLOTS };
            for (const img of fixData.images) {
              const slotKey = img.imageId as SlotId;
              if (newSlots[slotKey]) {
                newSlots[slotKey] = {
                  ...newSlots[slotKey],
                  dataUrl: img.dataUrl,
                  filename: img.filename,
                  mimeType: img.mimeType,
                };
              }
            }
            setSlots(newSlots);
          } else {
            setSlots(INITIAL_SLOTS);
          }
        } else {
          setSlots(INITIAL_SLOTS);
        }
      } finally {
        if (activeRequestIdRef.current === currentRequestId) {
          setIsFixtureLoading(false);
        }
      }
    } catch (err: unknown) {
      if (activeRequestIdRef.current !== currentRequestId) return;
      const msg = err instanceof Error ? err.message : String(err);
      setWoError(msg);
      setWorkOrder(null);
      setSlots(INITIAL_SLOTS);
    } finally {
      if (activeRequestIdRef.current === currentRequestId) {
        setWoLoading(false);
      }
    }
  };

  // Sample Selection Helper (Explicitly enters DEMO_SAMPLE mode)
  const handleSelectSample = async (sampleUnitId: string) => {
    await handleLoadUnit(sampleUnitId, "DEMO_SAMPLE");
  };

  // Initial load on mount
  useEffect(() => {
    let ignore = false;
    async function loadInitial() {
      try {
        setWoLoading(true);
        const [woRes, fixRes] = await Promise.all([
          fetch("/api/work-orders?unitId=SAMPLE-01"),
          fetch("/api/fixtures?unitId=SAMPLE-01&variant=default"),
        ]);
        if (ignore) return;
        if (woRes.ok) {
          const woData = await woRes.json();
          if (!ignore && woData.workOrder) {
            setWorkOrder(woData.workOrder);
          }
        }
        if (fixRes.ok) {
          const fixData = await fixRes.json();
          if (!ignore && fixData.images && fixData.images.length > 0) {
            const newSlots = { ...INITIAL_SLOTS };
            for (const img of fixData.images) {
              const slotKey = img.imageId as SlotId;
              if (newSlots[slotKey]) {
                newSlots[slotKey] = {
                  ...newSlots[slotKey],
                  dataUrl: img.dataUrl,
                  filename: img.filename,
                  mimeType: img.mimeType,
                };
              }
            }
            setSlots(newSlots);
          }
        }
      } catch {
        // initial load failure fallback
      } finally {
        if (!ignore) {
          setWoLoading(false);
        }
      }
    }
    loadInitial();
    return () => {
      ignore = true;
    };
  }, []);

  // Demo helper: loads the clearer expiry closeup into the Back slot for Sample C
  const handleLoadCloseup = async () => {
    setIsFixtureLoading(true);
    try {
      const res = await fetch(
        `/api/fixtures?unitId=${encodeURIComponent(selectedUnitId)}&slot=back&variant=closeup`
      );
      const data = await res.json();
      if (!res.ok || !data.slotImage) {
        throw new Error(data.error || "Failed to load clearer expiry photo");
      }
      setSlots((prev) => ({
        ...prev,
        back: {
          ...prev.back,
          dataUrl: data.slotImage.dataUrl,
          filename: data.slotImage.filename,
          mimeType: data.slotImage.mimeType,
        },
      }));
      // Replacing evidence invalidates the prior inspection result.
      setOperationalStatus(null);
      setEnrichedChecks([]);
      setLatestObservation(null);
      setRecoveryPlan(null);
      setRoutingDecision(null);
      setPreviousVerdicts({});
      setNewPhotoReady(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setInspectionError(`Failed to load clearer expiry photo: ${msg}`);
    } finally {
      setIsFixtureLoading(false);
    }
  };

  // Demo helper: loads the corrected BACK fixture for Sample B (DEMO-DEFECT)
  // This is EVIDENCE ONLY — does NOT set any verdict or operational status.
  const handleLoadCorrectedBack = async () => {
    setIsFixtureLoading(true);
    try {
      const res = await fetch(
        `/api/fixtures?unitId=${encodeURIComponent(selectedUnitId)}&slot=back&variant=corrected`
      );
      const data = await res.json();
      if (!res.ok || !data.slotImage) {
        throw new Error(data.error || "Failed to load corrected back photo");
      }
      // Replace only the BACK evidence slot — no verdict is set
      setSlots((prev) => ({
        ...prev,
        back: {
          ...prev.back,
          dataUrl: data.slotImage.dataUrl,
          filename: data.slotImage.filename,
          mimeType: data.slotImage.mimeType,
        },
      }));
      // Invalidate prior inspection result so operator must RE-INSPECT
      setOperationalStatus(null);
      setEnrichedChecks([]);
      setLatestObservation(null);
      setRecoveryPlan(null);
      setRoutingDecision(null);
      setPreviousVerdicts({});
      setNewPhotoReady(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setInspectionError(`Failed to load corrected back photo: ${msg}`);
    } finally {
      setIsFixtureLoading(false);
    }
  };

  // Upload custom file into slot
  const handleFileUpload = (slotId: SlotId, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUnitMode("MANUAL_UNIT");
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setSlots((prev) => ({
        ...prev,
        [slotId]: {
          ...prev[slotId],
          dataUrl,
          filename: file.name,
          mimeType: file.type || "image/jpeg",
        },
      }));
      // Replacing evidence always invalidates the prior inspection result.
      // Corrected evidence must never inherit a stale verdict.
      setOperationalStatus(null);
      setEnrichedChecks([]);
      setLatestObservation(null);
      setRecoveryPlan(null);
      setRoutingDecision(null);
      setPreviousVerdicts({});
      setNewPhotoReady(true);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleRemoveImage = (slotId: SlotId) => {
    setSlots((prev) => ({
      ...prev,
      [slotId]: {
        ...prev[slotId],
        dataUrl: null,
        filename: null,
      },
    }));
    setNewPhotoReady(false);
  };

  // Pre-inspection evidence quality readiness evaluation
  const readiness = useMemo(() => {
    return evaluateEvidenceReadiness({
      slots: Object.values(slots).map((s) => ({
        slotId: s.imageId,
        dataUrl: s.dataUrl,
        mimeType: s.mimeType,
      })),
    });
  }, [slots]);

  // Missing photos actionable message calculation
  const missingSlots = useMemo(() => {
    const missing: string[] = [];
    if (!slots.front.dataUrl) missing.push("Front");
    if (!slots.back.dataUrl) missing.push("Back");
    if (!slots.label.dataUrl) missing.push("Label");
    return missing;
  }, [slots]);

  const missingPhotosMessage = useMemo(() => {
    if (missingSlots.length === 0) return null;
    if (missingSlots.length === 1) {
      return `Add the ${missingSlots[0]} photo to continue.`;
    }
    if (missingSlots.length === 2) {
      return `Add the ${missingSlots[0]} and ${missingSlots[1]} photos to continue.`;
    }
    return "Add all required photos to continue.";
  }, [missingSlots]);

  // Inspection gating & strict synchronization verification
  const isUnitIdSynced = unitInput.trim().toUpperCase() === selectedUnitId;
  const isWorkOrderReady =
    !woLoading &&
    workOrder !== null &&
    workOrder.unitId === selectedUnitId &&
    isUnitIdSynced;

  const canTriggerInspection =
    !isInspecting &&
    !woLoading &&
    !isFixtureLoading &&
    isWorkOrderReady &&
    readiness.canInspect;

  const inspectionDisabledReason = useMemo(() => {
    if (isInspecting) return "Inspecting unit...";
    if (woLoading) return "Loading work order requirements...";
    if (isFixtureLoading) return "Loading photos...";
    if (!isUnitIdSynced) {
      return `Click 'Load Work Order' to load preparation requirements for ${unitInput.trim().toUpperCase()}.`;
    }
    if (!workOrder) {
      return "Please load a valid work order before inspecting.";
    }
    if (workOrder.unitId !== selectedUnitId) {
      return "Work order context mismatch. Please reload work order.";
    }
    if (!readiness.canInspect) {
      return missingPhotosMessage || "Add all required photos first.";
    }
    return null;
  }, [
    isInspecting,
    woLoading,
    isFixtureLoading,
    isUnitIdSynced,
    unitInput,
    workOrder,
    selectedUnitId,
    readiness.canInspect,
    missingPhotosMessage,
  ]);

  // Run full inspection pipeline
  const handleInspect = async () => {
    if (!workOrder || workOrder.unitId !== selectedUnitId) {
      setInspectionError("Work order is not loaded for the selected unit. Please click 'Load Work Order'.");
      return;
    }

    if (!isUnitIdSynced) {
      setInspectionError(`Unit input (${unitInput}) does not match loaded work order (${selectedUnitId}). Please click 'Load Work Order'.`);
      return;
    }

    const activeImages = Object.values(slots)
      .filter((s) => s.dataUrl !== null)
      .map((s) => ({
        imageId: s.imageId,
        mimeType: s.mimeType,
        imageData: s.dataUrl as string,
      }));

    if (activeImages.length === 0) {
      setInspectionError("Please provide at least one photo to inspect.");
      return;
    }

    // Save previous verdicts before re-running to detect transitions
    if (enrichedChecks.length > 0) {
      const prevMap: Record<string, "PASS" | "FAIL" | "UNCERTAIN" | null> = {};
      for (const c of enrichedChecks) {
        prevMap[c.checkType] = c.verdict;
      }
      setPreviousVerdicts(prevMap);
    }

    setIsInspecting(true);
    setInspectionError(null);
    setActiveStageIdx(0);
    setNewPhotoReady(false);
    setActiveProblemIndex(0);
    setShowAllProblems(false);
    setExpandedWhyTasks({});

    const stageTimer1 = setTimeout(() => setActiveStageIdx(1), 900);
    const stageTimer2 = setTimeout(() => setActiveStageIdx(2), 2100);

    try {
      const res = await fetch("/api/inspection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId: selectedUnitId,
          orgId: "org_demo_alpha",
          workOrder,
          images: activeImages,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Inspection pass failed.");
      }

      setOperationalStatus(data.operationalStatus);
      setEnrichedChecks(data.enrichedChecks || []);
      setLatestObservation(data.observation || null);
      setRecoveryPlan(data.recoveryPlan || null);
      setRoutingDecision(data.routingDecision || null);
      setInspectionIteration((prev) => prev + 1);
      setMetadata(data.metadata || null);
      if (data.workOrder) {
        setWorkOrder(data.workOrder);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setInspectionError(translateErrorToHuman(msg));
    } finally {
      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      setIsInspecting(false);
    }
  };

  // Inspect next unit handler
  const handleInspectNextUnit = () => {
    resetInspectionState();
    setSlots(INITIAL_SLOTS);
  };

  // Tiny prep requirements chips
  const prepRequirementChips = useMemo(() => {
    if (!workOrder) return [];
    const chips: string[] = [];
    if (workOrder.requirements.polybag === "REQUIRED") {
      chips.push("Polybag required");
    }
    if (workOrder.requirements.suffocationWarning === "REQUIRED") {
      chips.push("Suffocation warning required");
    }
    if (workOrder.requirements.expiryDate === "REQUIRED") {
      chips.push("Expiry required");
    }
    if (workOrder.requirements.handlingMarks?.state === "REQUIRED") {
      chips.push("Handling marks required");
    }
    return chips;
  }, [workOrder]);

  // Derive human-first actionable problems with strict deterministic ordering
  const actionableProblems = useMemo(() => {
    if (!operationalStatus || !workOrder) return [];

    const fallbackObservation: PrepUnitObservation = {
      unitId: selectedUnitId,
      imageQuality: { overall: "GOOD", issues: [] },
      fnsku: {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedValue: null,
        placement: "UNCERTAIN",
        placementDescription: null,
        evidence: [],
      },
      polybag: {
        visibility: "NOT_DETECTED",
        packagingType: "NONE_DETECTED",
        sealStatus: "UNCERTAIN",
        evidence: [],
      },
      suffocationWarning: {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedText: null,
        evidence: [],
      },
      manufacturerBarcode: {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedValue: null,
        evidence: [],
      },
      manufacturerBarcodeCoverage: {
        status: "NOT_COVERED",
        coveringType: null,
        evidence: [],
      },
      expiryDate: {
        visibility: "NOT_DETECTED",
        legibility: "UNCERTAIN",
        detectedValue: null,
        evidence: [],
      },
      handlingMarks: [],
      otherVisibleIssues: [],
    };

    return getOrderedOperatorProblems({
      enrichedChecks,
      workOrder,
      observation: latestObservation ?? fallbackObservation,
      recoveryPlan,
    });
  }, [enrichedChecks, workOrder, latestObservation, operationalStatus, selectedUnitId, recoveryPlan]);

  // Done checks (PASS)
  const passChecks = useMemo(
    () => enrichedChecks.filter((c) => c.verdict === "PASS"),
    [enrichedChecks]
  );

  // Transitions: e.g. Expiry Date UNCERTAIN -> PASS
  const transitionedChecks = useMemo(() => {
    return enrichedChecks.filter(
      (c) => previousVerdicts[c.checkType] === "UNCERTAIN" && c.verdict === "PASS"
    );
  }, [enrichedChecks, previousVerdicts]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-amber-500/30 selection:text-amber-200">
      {/* Primary Clean Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/90 px-6 py-4 sticky top-0 z-40 backdrop-blur">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <span className="h-7 w-7 rounded-md bg-amber-500 text-zinc-950 font-black text-sm flex items-center justify-center">
                ✓
              </span>
              <span>Prep Manager</span>
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              Verify a unit before shipment
            </p>
          </div>

          {/* Warehouse Operator Context */}
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-zinc-800/80 border border-zinc-700/80 text-[11px] font-mono font-semibold text-zinc-300">
              STATION #04 • FBA INBOUND
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
        {/* STEP 1: UNIT SELECTION */}
        <section className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 sm:p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                Step 1
              </div>
              <h2 className="text-base font-bold text-white">Unit</h2>
            </div>
            <span
              className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase border ${
                unitMode === "DEMO_SAMPLE"
                  ? "bg-amber-950/60 text-amber-300 border-amber-800/80"
                  : "bg-cyan-950/60 text-cyan-300 border-cyan-800/80"
              }`}
            >
              {unitMode === "DEMO_SAMPLE" ? "Controlled Demo Mode" : "Manual / Real Unit Mode"}
            </span>
          </div>

          {/* Manual Unit ID Input + Load Work Order */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[240px]">
              <label
                htmlFor="unit-id-input"
                className="block text-[11px] font-semibold text-zinc-400 mb-1"
              >
                Unit ID
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="unit-id-input"
                  type="text"
                  value={unitInput}
                  onChange={(e) => setUnitInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleLoadUnit(unitInput, "MANUAL_UNIT");
                    }
                  }}
                  placeholder="e.g. UNIT-0001, REAL-PACKAGE-001"
                  className="bg-zinc-950 border border-zinc-700 text-zinc-100 rounded-xl px-3.5 py-2 text-sm font-mono focus:outline-none focus:border-amber-500 w-full"
                />
                <button
                  type="button"
                  onClick={() => handleLoadUnit(unitInput, "MANUAL_UNIT")}
                  disabled={woLoading || isFixtureLoading || !unitInput.trim()}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer whitespace-nowrap shadow"
                >
                  {woLoading ? "Loading..." : "Load Work Order"}
                </button>
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">
                Enter or scan a unit ID to load its preparation requirements.
              </p>
            </div>
          </div>

          {/* Try sample data — clicking auto-loads work order + photos */}
          <div className="pt-3 border-t border-zinc-800/80 space-y-2">
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              Try sample data
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {SAMPLE_UNITS.map((sample) => (
                <button
                  key={sample.unitId}
                  type="button"
                  onClick={() => handleSelectSample(sample.unitId)}
                  title={`${sample.unitId} — auto-loads work order and photos`}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    selectedUnitId === sample.unitId && unitMode === "DEMO_SAMPLE"
                      ? "bg-amber-500 text-zinc-950 border-amber-400 font-bold shadow-sm"
                      : "bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border-zinc-700/80"
                  }`}
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </div>

          {/* Under selected unit show: SKU, Expected Amazon/FNSKU label, ASIN, required prep */}
          <div className="pt-3 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <span className="text-zinc-500 text-[11px] block">SKU</span>
                <span className="font-semibold text-zinc-200">
                  {woLoading ? "..." : workOrder?.sku ?? "SKU-UNKNOWN"}
                </span>
              </div>
              <div>
                <span className="text-zinc-500 text-[11px] block">Expected Amazon/FNSKU (Work Order)</span>
                <span className="font-semibold text-amber-400 font-mono">
                  {woLoading ? "..." : workOrder?.expectedFnsku ?? "—"}
                </span>
              </div>
              {workOrder?.asin && (
                <div>
                  <span className="text-zinc-500 text-[11px] block">ASIN</span>
                  <span className="font-mono text-zinc-400">{workOrder.asin}</span>
                </div>
              )}
            </div>

            {/* Prep requirement chips */}
            {prepRequirementChips.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-zinc-500 mr-1">Required prep:</span>
                {prepRequirementChips.map((chip, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700/80 text-[10px] font-medium"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            )}
          </div>

          {woError && (
            <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">
              {woError}
            </div>
          )}
        </section>

        {/* STEP 2: PHOTO AREA (3 Cards with Human Photo Guidance) */}
        <section className="space-y-4">
          <div className="space-y-1">
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
              Step 2
            </div>
            <h2 className="text-base font-bold text-white">Add Photos</h2>
          </div>

          {/* 3 Large Cards: Desktop side-by-side, mobile stacked */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
            {(["front", "back", "label"] as SlotId[]).map((slotId) => {
              const slot = slots[slotId];
              const isSupplied = slot.dataUrl !== null;
              const slotValidation = readiness.slotStatuses[slotId];
              const isWarning = isSupplied && slotValidation?.status === "WARNING";
              const guidance = PHOTO_CAPTURE_GUIDANCE[slotId];

              const stateLabel = !isSupplied
                ? "Missing"
                : isWarning
                ? "Warning"
                : "Ready";

              return (
                <div
                  key={slotId}
                  className={`rounded-2xl border transition-all flex flex-col justify-between overflow-hidden ${
                    isSupplied
                      ? isWarning
                        ? "bg-zinc-900 border-amber-600/70"
                        : "bg-zinc-900 border-zinc-700/80 shadow-sm"
                      : "bg-zinc-900/40 border-zinc-800 border-dashed"
                  }`}
                >
                  {/* Card Header: Slot Title + Guidance + State Badge */}
                  <div className="p-4 border-b border-zinc-800/80 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm tracking-wide uppercase text-white">
                        {guidance.name}
                      </span>
                      <span
                        className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                          stateLabel === "Ready"
                            ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                            : stateLabel === "Warning"
                            ? "bg-amber-950 text-amber-300 border border-amber-800"
                            : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                        }`}
                      >
                        {stateLabel}
                      </span>
                    </div>
                    {/* Clear, human photo capture guidance before inspection */}
                    <p className="text-xs text-zinc-300 font-medium">
                      &ldquo;{guidance.instruction}&rdquo;
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      {guidance.shortHint}
                    </p>
                  </div>

                  {/* Photo Preview / Large Placeholder */}
                  <div className="h-52 w-full bg-zinc-950/80 relative flex items-center justify-center p-2">
                    {slot.dataUrl ? (
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewImage({
                            title: `${selectedUnitId} — ${slot.name} View`,
                            src: slot.dataUrl!,
                          })
                        }
                        className="h-full w-full relative group cursor-zoom-in rounded-lg overflow-hidden focus:outline-none"
                      >
                        <Image
                          src={slot.dataUrl}
                          alt={slot.name}
                          fill
                          unoptimized
                          className="object-contain transition-transform group-hover:scale-[1.02]"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs text-white font-semibold">
                          🔍 Click to zoom
                        </div>
                      </button>
                    ) : (
                      <div className="text-center p-6 space-y-2">
                        <div className="h-10 w-10 mx-auto rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500">
                          📷
                        </div>
                        <p className="text-xs text-zinc-500">No photo added</p>
                      </div>
                    )}
                  </div>

                  {/* Only show technical error/warning if capture fails, translated into human wording */}
                  {isWarning && slotValidation?.issues && slotValidation.issues.length > 0 && (
                    <div className="p-2.5 bg-amber-950/40 border-t border-amber-900/60 text-[11px] text-amber-300 font-medium">
                      {slotValidation.issues.map(translateErrorToHuman).join(", ")}
                    </div>
                  )}

                  {/* Card Actions: Add photo, Replace, Remove */}
                  <div className="p-3 bg-zinc-900/60 border-t border-zinc-800/80 flex items-center gap-2">
                    <input
                      type="file"
                      ref={fileInputRefs[slotId]}
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => handleFileUpload(slotId, e)}
                      className="hidden"
                    />

                    {!isSupplied ? (
                      <button
                        type="button"
                        onClick={() => fileInputRefs[slotId].current?.click()}
                        className="w-full py-2 px-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <span>+ Add photo</span>
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => fileInputRefs[slotId].current?.click()}
                          className="flex-1 py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold border border-zinc-700 transition-colors cursor-pointer"
                        >
                          Replace
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(slotId)}
                          className="py-1.5 px-3 bg-zinc-800/80 hover:bg-rose-950 hover:text-rose-300 text-zinc-400 rounded-lg text-xs font-semibold border border-zinc-700 transition-colors cursor-pointer"
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Actionable Readiness Message */}
          <div className="text-center pt-1">
            {missingSlots.length === 0 ? (
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-800/60 px-3.5 py-1.5 rounded-full">
                <span>✓</span>
                <span>Photos ready</span>
              </div>
            ) : (
              <div className="text-xs font-medium text-amber-300/90">
                {missingPhotosMessage}
              </div>
            )}
          </div>
        </section>

        {/* STEP 3: PRIMARY CTA (INSPECT UNIT) */}
        <section className="space-y-2">
          <div className="space-y-1">
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
              Step 3
            </div>
          </div>

          <button
            type="button"
            onClick={handleInspect}
            disabled={!canTriggerInspection}
            className={`w-full py-4 px-6 rounded-2xl font-black text-base tracking-wide uppercase shadow-lg transition-all ${
              !canTriggerInspection
                ? "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700/60"
                : "bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-amber-500/10 hover:scale-[1.01] cursor-pointer"
            }`}
          >
            {isInspecting ? "Inspecting unit..." : "INSPECT UNIT"}
          </button>

          {/* Explanation when disabled */}
          {!canTriggerInspection && !isInspecting && inspectionDisabledReason && (
            <p className="text-xs text-zinc-400 text-center font-medium">
              {inspectionDisabledReason}
            </p>
          )}

          {inspectionError && (
            <div className="p-3 bg-rose-950/60 border border-rose-800 text-rose-300 text-xs rounded-xl text-center">
              {inspectionError}
            </div>
          )}
        </section>

        {/* INSPECTION LOADING STATE */}
        {isInspecting && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center space-y-4 animate-in fade-in duration-200">
            <div className="h-6 w-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <h3 className="text-base font-bold text-white">Inspecting unit...</h3>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 text-xs">
              {LOADING_STEPS.map((step, idx) => {
                const isCurrent = activeStageIdx === idx;
                const isDone = activeStageIdx > idx;
                return (
                  <div
                    key={step}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all ${
                      isDone
                        ? "bg-emerald-950/40 border-emerald-800 text-emerald-300"
                        : isCurrent
                        ? "bg-amber-500/20 border-amber-500 text-amber-300 font-bold animate-pulse"
                        : "bg-zinc-950 border-zinc-800 text-zinc-500"
                    }`}
                  >
                    <span>{isDone ? "✓" : "•"}</span>
                    <span>{step}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* RESULT SCREEN — HUMAN-FIRST OPERATOR EXPERIENCE */}
        {operationalStatus && !isInspecting && (
          <section className="space-y-6 pt-2">
            {/* SUCCESS STATE (✓ DONE) */}
            {operationalStatus.status === "READY" && (
              <div className="p-6 sm:p-8 rounded-2xl border-2 border-emerald-500 bg-emerald-950/40 text-center space-y-3 shadow-xl">
                <div className="flex items-center justify-center gap-3">
                  <span className="text-4xl sm:text-5xl font-black text-emerald-400">
                    ✓ DONE
                  </span>
                  <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-emerald-900/80 text-emerald-200 border border-emerald-700 tracking-wider">
                    READY
                  </span>
                </div>
                <p className="text-base sm:text-lg font-semibold text-white max-w-xl mx-auto">
                  This unit is ready for the next step.
                </p>
                <p className="text-xs text-zinc-400">
                  You don&apos;t need to fix anything.
                </p>
                <div className="pt-3">
                  <button
                    type="button"
                    onClick={handleInspectNextUnit}
                    className="px-8 py-3 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-xl font-black text-sm uppercase tracking-wider transition-transform hover:scale-[1.02] shadow-lg shadow-emerald-500/20 cursor-pointer"
                  >
                    START NEXT UNIT
                  </button>
                </div>

                {/* Transition Indicator if previous inspection had uncertainties resolved */}
                {transitionedChecks.length > 0 && (
                  <div className="pt-3 flex flex-wrap items-center justify-center gap-2">
                    {transitionedChecks.map((tc) => (
                      <div
                        key={tc.checkId}
                        className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400 text-emerald-300 text-xs font-bold flex items-center gap-1.5"
                      >
                        <span>{CHECK_HUMAN_TITLES[tc.checkType] ?? tc.checkName}:</span>
                        <span>Clearer photo resolved ✓</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ACTIONABLE PROBLEMS AREA: ONE PROBLEM AT A TIME */}
            {actionableProblems.length > 0 && (
              <div className="space-y-4">
                {/* Header Summary for problems */}
                <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full bg-rose-500 animate-pulse"></span>
                    <h3 className="text-base sm:text-lg font-bold text-white">
                      {actionableProblems.length === 1
                        ? "1 thing needs attention"
                        : `${actionableProblems.length} things need attention`}
                    </h3>
                    {actionableProblems.length > 1 && !showAllProblems && (
                      <span className="px-2.5 py-0.5 rounded-full bg-zinc-800 text-amber-400 font-mono text-xs font-bold border border-zinc-700">
                        {activeProblemIndex + 1} of {actionableProblems.length}
                      </span>
                    )}
                  </div>

                  {actionableProblems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setShowAllProblems(!showAllProblems)}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold border border-zinc-700 transition-colors cursor-pointer"
                    >
                      {showAllProblems
                        ? "Show 1 at a time"
                        : `View all ${actionableProblems.length}`}
                    </button>
                  )}
                </div>

                {/* Render prioritized task cards */}
                {(showAllProblems
                  ? actionableProblems
                  : [actionableProblems[activeProblemIndex]]
                ).map((task, idx) => {
                  const taskIndex = showAllProblems ? idx : activeProblemIndex;
                  const isWhyExpanded = !!expandedWhyTasks[task.id];
                  const evidenceDataUrl = slots[task.evidenceSlot]?.dataUrl;

                  return (
                    <div
                      key={task.id}
                      className={`rounded-2xl border p-5 sm:p-6 space-y-5 shadow-lg transition-all ${
                        task.internalVerdict === "FAIL"
                          ? "bg-zinc-900/90 border-rose-800/80"
                          : "bg-zinc-900/90 border-amber-800/80"
                      }`}
                    >
                      {/* Card Header: Action-First Lead */}
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black tracking-wider uppercase">
                              {task.headline}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                task.internalVerdict === "FAIL"
                                  ? "bg-rose-950 text-rose-300 border border-rose-800"
                                  : "bg-amber-950 text-amber-300 border border-amber-800"
                              }`}
                            >
                              {task.humanVerdictLabel}
                            </span>
                            {task.resolvesCheckTypes && task.resolvesCheckTypes.length > 1 && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                                Resolves {task.resolvesCheckTypes.length} checks
                              </span>
                            )}
                          </div>
                          <h4 className="text-lg sm:text-xl font-black text-white">
                            {task.actionTitle}
                          </h4>
                        </div>

                        {actionableProblems.length > 1 && showAllProblems && (
                          <span className="text-xs font-mono text-zinc-500">
                            Task {taskIndex + 1} of {actionableProblems.length}
                          </span>
                        )}
                      </div>

                      {/* Visual Evidence Section */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
                        {/* Evidence Photo */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs text-zinc-400">
                            <span className="font-bold tracking-wider uppercase text-zinc-300">
                              PHOTO: {task.evidenceSlotDisplay}
                            </span>
                            {evidenceDataUrl && (
                              <span className="text-[11px] text-zinc-500">Click to zoom</span>
                            )}
                          </div>

                          <div className="h-56 w-full rounded-xl bg-zinc-950 border border-zinc-800 relative overflow-hidden flex items-center justify-center p-2">
                            {evidenceDataUrl ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewImage({
                                    title: `${task.actionTitle} (${task.evidenceSlotDisplay} View)`,
                                    src: evidenceDataUrl,
                                  })
                                }
                                className="h-full w-full relative group cursor-zoom-in rounded-lg overflow-hidden focus:outline-none"
                              >
                                <Image
                                  src={evidenceDataUrl}
                                  alt={task.actionTitle}
                                  fill
                                  unoptimized
                                  className="object-contain transition-transform group-hover:scale-[1.02]"
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs text-white font-semibold">
                                  🔍 Click to zoom
                                </div>
                              </button>
                            ) : (
                              <div className="text-center p-4 text-xs text-zinc-500">
                                No photo available for {task.evidenceSlotDisplay} view
                              </div>
                            )}
                          </div>

                          {/* Translated Human Observation directly below photo */}
                          <div className="p-3 rounded-lg bg-zinc-950/80 border border-zinc-800 text-xs space-y-1.5">
                            <div>
                              <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block mb-0.5">
                                AI observation
                              </span>
                              <p className="text-zinc-200 font-medium">
                                &ldquo;{task.humanObservation}&rdquo;
                              </p>
                            </div>
                            {task.resolvesCheckTypes.includes("FNSKU_IDENTITY") && workOrder?.expectedFnsku && (
                              <div className="text-[11px] pt-1.5 border-t border-zinc-800/80 flex items-center justify-between">
                                <span className="text-zinc-500">Expected from work order:</span>
                                <span className="font-mono text-amber-400 font-bold">{workOrder.expectedFnsku}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* WHAT TO DO */}
                        <div className="space-y-4 flex flex-col justify-between h-full">
                          <div className="space-y-3">
                            <div className="text-xs font-bold uppercase tracking-wider text-amber-400">
                              WHAT TO DO
                            </div>

                            {/* Photo recovery checklist if applicable */}
                            {task.photoRecoveryHints && (
                              <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/60 space-y-2">
                                <p className="text-xs text-zinc-200 font-semibold">
                                  Photo capture guidance:
                                </p>
                                <div className="space-y-1 text-xs text-amber-300 font-medium">
                                  {task.photoRecoveryHints.checklist.map((item, i) => (
                                    <div key={i} className="flex items-center gap-1.5">
                                      <span className="text-emerald-400 font-bold">✓</span>
                                      <span>{item}</span>
                                    </div>
                                  ))}
                                </div>
                                {task.photoRecoveryHints.exampleText && (
                                  <div className="pt-1 text-[11px] text-zinc-400 font-mono">
                                    Example: {task.photoRecoveryHints.exampleText}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Step-by-step instructions */}
                            <div className="space-y-2 text-xs sm:text-sm text-zinc-200">
                              {task.whatToDoSteps.map((step, sIdx) => (
                                <div
                                  key={sIdx}
                                  className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80 font-medium"
                                >
                                  {step}
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Primary Action Buttons */}
                          <div className="pt-2 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => fileInputRefs[task.evidenceSlot]?.current?.click()}
                                className="flex-1 py-3 px-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-transform hover:scale-[1.01] shadow cursor-pointer"
                              >
                                <span>📷</span>
                                <span>{task.ctaText}</span>
                              </button>

                              {/* Manual / Real Unit: Genuine Replace Photo Action */}
                              <button
                                type="button"
                                onClick={() => fileInputRefs[task.evidenceSlot]?.current?.click()}
                                className="py-3 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-bold border border-zinc-700 transition-colors cursor-pointer"
                              >
                                REPLACE PHOTO
                              </button>

                              {/* Demo helper: USE CORRECTED BACK PHOTO (Controlled demo Sample B only) */}
                              {unitMode === "DEMO_SAMPLE" &&
                                (selectedUnitId === "SAMPLE-02" ||
                                  selectedUnitId === "DEMO-DEFECT") &&
                                task.checkType === "MANUFACTURER_BARCODE_COVERAGE" && (
                                  <button
                                    type="button"
                                    onClick={handleLoadCorrectedBack}
                                    disabled={isFixtureLoading}
                                    className="py-3 px-3 bg-zinc-800 hover:bg-zinc-700 text-amber-300 rounded-xl text-xs font-bold border border-zinc-700 transition-colors cursor-pointer"
                                  >
                                    USE CORRECTED BACK PHOTO
                                  </button>
                                )}

                              {/* Demo helper: Use clearer expiry photo (Controlled demo Sample C only) */}
                              {unitMode === "DEMO_SAMPLE" &&
                                (selectedUnitId === "SAMPLE-03" ||
                                  selectedUnitId === "DEMO-RECOVERY") &&
                                (task.checkType === "EXPIRY_LEGIBILITY" ||
                                  task.checkType === "EXPIRY_VISIBILITY" ||
                                  task.resolvesCheckTypes?.includes("EXPIRY_LEGIBILITY")) && (
                                  <button
                                    type="button"
                                    onClick={handleLoadCloseup}
                                    disabled={isFixtureLoading}
                                    className="py-3 px-3 bg-zinc-800 hover:bg-zinc-700 text-amber-300 rounded-xl text-xs font-bold border border-zinc-700 transition-colors cursor-pointer"
                                  >
                                    Use clearer expiry photo
                                  </button>
                                )}

                              <button
                                type="button"
                                onClick={handleInspect}
                                disabled={!canTriggerInspection}
                                className={`py-3 px-4 rounded-xl text-xs font-bold border transition-colors ${
                                  !canTriggerInspection
                                    ? "bg-zinc-800/60 text-zinc-600 border-zinc-800 cursor-not-allowed"
                                    : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700 cursor-pointer"
                                }`}
                              >
                                RE-INSPECT
                              </button>
                            </div>

                            {newPhotoReady && (
                              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-xs animate-pulse">
                                <span>✓</span>
                                <span>New photo ready. Click RE-INSPECT to evaluate.</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Navigation between multiple tasks (in single mode) */}
                      {!showAllProblems && actionableProblems.length > 1 && (
                        <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between gap-3 text-xs">
                          <button
                            type="button"
                            onClick={() =>
                              setActiveProblemIndex((prev) => Math.max(0, prev - 1))
                            }
                            disabled={activeProblemIndex === 0}
                            className={`px-3 py-1.5 rounded-lg border font-semibold transition-colors cursor-pointer ${
                              activeProblemIndex === 0
                                ? "opacity-40 cursor-not-allowed border-zinc-800 text-zinc-600"
                                : "border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                            }`}
                          >
                            ← PREVIOUS FIX
                          </button>

                          <span className="font-mono text-zinc-500">
                            {activeProblemIndex + 1} of {actionableProblems.length}
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              setActiveProblemIndex((prev) =>
                                Math.min(actionableProblems.length - 1, prev + 1)
                              )
                            }
                            disabled={activeProblemIndex === actionableProblems.length - 1}
                            className={`px-3 py-1.5 rounded-lg border font-semibold transition-colors cursor-pointer ${
                              activeProblemIndex === actionableProblems.length - 1
                                ? "opacity-40 cursor-not-allowed border-zinc-800 text-zinc-600"
                                : "border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                            }`}
                          >
                            NEXT FIX →
                          </button>
                        </div>
                      )}

                      {/* Secondary: Why am I being asked to do this? */}
                      <div className="pt-2 border-t border-zinc-800/60">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedWhyTasks((prev) => ({
                              ...prev,
                              [task.id]: !prev[task.id],
                            }))
                          }
                          className="text-xs text-zinc-400 hover:text-zinc-200 font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <span>Why am I being asked to do this?</span>
                          <span>{isWhyExpanded ? "▲" : "▼"}</span>
                        </button>

                        {isWhyExpanded && (
                          <div className="mt-2.5 p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/80 space-y-2 text-xs">
                            <p className="text-zinc-300 leading-relaxed">
                              {task.whyExplanation}
                            </p>
                            <div className="pt-1 text-[11px] text-zinc-500 flex flex-wrap items-center justify-between gap-2">
                              <span>Policy requirement: {task.technical.policyRule}</span>
                              <button
                                type="button"
                                onClick={() => setShowWhyDecision(true)}
                                className="text-amber-400 hover:underline cursor-pointer"
                              >
                                View inspection details ↓
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* DONE CHECKS (COLLAPSED) */}
            {passChecks.length > 0 && (
              <div className="border border-zinc-800 rounded-xl bg-zinc-900/40 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowPassedChecks(!showPassedChecks)}
                  className="w-full px-5 py-3.5 flex items-center justify-between text-left text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2 text-emerald-400">
                    <span>✓</span>
                    <span>{passChecks.length} checks done</span>
                  </span>
                  <span>{showPassedChecks ? "▲ Hide" : "▼ Show"}</span>
                </button>

                {showPassedChecks && (
                  <div className="p-4 border-t border-zinc-800 space-y-2 bg-zinc-950/60">
                    {passChecks.map((c) => (
                      <div
                        key={c.checkId}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900/80 text-xs"
                      >
                        <span className="font-medium text-zinc-200">
                          {CHECK_HUMAN_TITLES[c.checkType] ?? c.checkName}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 uppercase">
                          Done
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* EXPANDED: INSPECTION DETAILS (TECHNICAL AUDIT LEVEL) */}
            <div className="border border-zinc-800 rounded-2xl bg-zinc-900/40 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowWhyDecision(!showWhyDecision)}
                className="w-full px-6 py-4 flex items-center justify-between text-left text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <span>⚖️</span>
                  <span>Inspection Details</span>
                </span>
                <span>{showWhyDecision ? "▲ Hide details" : "▼ Inspection details"}</span>
              </button>

              {showWhyDecision && (
                <div className="p-6 border-t border-zinc-800 space-y-6 bg-zinc-950 text-xs">
                  {/* AI SEES -> RULE ENGINE DECIDES banner */}
                  <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/40 font-mono text-[10px] font-bold uppercase">
                        AI SEES
                      </span>
                      <span className="text-zinc-400">
                        Multimodal Gemini extracts factual visual observations
                      </span>
                    </div>

                    <div className="hidden md:block text-zinc-600 font-bold">→</div>

                    <div className="flex items-center gap-2.5">
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40 font-mono text-[10px] font-bold uppercase">
                        RULE ENGINE DECIDES
                      </span>
                      <span className="text-zinc-400">
                        Deterministic TypeScript engine evaluates Amazon policies
                      </span>
                    </div>
                  </div>

                  {/* Metadata strip */}
                  {metadata && (
                    <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-zinc-900/60 border border-zinc-800 text-[11px] font-mono text-zinc-400">
                      <div>
                        Vision Model:{" "}
                        <span className="text-zinc-200">{metadata.model ?? "gemini-2.5-flash"}</span>
                      </div>
                      <div>
                        Latency:{" "}
                        <span className="text-zinc-200">
                          {metadata.durationMs ? `${(metadata.durationMs / 1000).toFixed(2)}s` : "—"}
                        </span>
                      </div>
                      <div>
                        Iteration:{" "}
                        <span className="text-amber-400 font-bold">Pass #{inspectionIteration}</span>
                      </div>
                      <div>
                        Route:{" "}
                        <span className="text-zinc-200 font-bold">
                          {routingDecision ?? operationalStatus.status}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Complete Traceability Table */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                      Full Rule-to-Observation Trace
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-zinc-800">
                      <table className="w-full text-left border-collapse text-[11px]">
                        <thead>
                          <tr className="bg-zinc-900 border-b border-zinc-800 text-[10px] uppercase font-mono text-zinc-400">
                            <th className="py-2.5 px-3">Check</th>
                            <th className="py-2.5 px-3">AI Observation</th>
                            <th className="py-2.5 px-3">Work-order Requirement</th>
                            <th className="py-2.5 px-3">Verified Rule</th>
                            <th className="py-2.5 px-3">Decision</th>
                            <th className="py-2.5 px-3">Source Provenance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                          {enrichedChecks.map((c) => (
                            <tr key={c.checkId} className="hover:bg-zinc-900/40">
                              <td className="py-2.5 px-3 font-semibold text-zinc-200">
                                <div>{CHECK_HUMAN_TITLES[c.checkType] ?? c.checkName}</div>
                                <div className="text-[10px] font-mono text-zinc-500">{c.checkType}</div>
                              </td>
                              <td className="py-2.5 px-3 font-mono text-amber-300">
                                {c.observationDetails || c.observedFact}
                              </td>
                              <td className="py-2.5 px-3 text-zinc-300">
                                {c.expectedRequirement}
                              </td>
                              <td className="py-2.5 px-3 text-zinc-300">
                                <div>{c.policyTitle}</div>
                                <div className="text-[10px] text-zinc-500 font-mono">
                                  Reason: {c.reasonCode}
                                </div>
                              </td>
                              <td className="py-2.5 px-3">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase ${
                                    c.verdict === "PASS"
                                      ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                                      : c.verdict === "FAIL"
                                      ? "bg-rose-950 text-rose-300 border border-rose-800"
                                      : c.verdict === "UNCERTAIN"
                                      ? "bg-amber-950 text-amber-300 border border-amber-800"
                                      : "bg-zinc-800 text-zinc-500 border border-zinc-700"
                                  }`}
                                >
                                  {c.verdict ?? c.applicability}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-zinc-400 text-[10px]">
                                <div>{c.policySource.publisher}</div>
                                <div className="text-zinc-500">
                                  {c.policySource.retrievalDate}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {/* Full-Image Zoom Modal */}
      {previewImage && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="max-w-4xl w-full bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <span className="font-bold text-xs uppercase text-zinc-200">
                {previewImage.title}
              </span>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="px-2.5 py-1 text-xs rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer"
              >
                ✕ Close
              </button>
            </div>
            <div className="h-[70vh] relative w-full bg-zinc-950 flex items-center justify-center">
              <Image
                src={previewImage.src}
                alt={previewImage.title}
                fill
                unoptimized
                className="object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* Minimal Operator Footer */}
      <footer className="border-t border-zinc-800 bg-zinc-950 p-4 text-center text-xs text-zinc-600">
        Prep Manager • Inbound Compliance Station
      </footer>
    </div>
  );
}

import React, { useState, useEffect, useRef } from "react";
import {
  Card,
  CardBody,
  CardHeader,
  Input,
  Button,
  Textarea,
  Divider,
  Tabs,
  Tab,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Chip,
} from "@nextui-org/react";
import { useSearchParams, useNavigate, useParams } from "react-router-dom";
import {
  PatientService,
  VisitService,
  TemplateService,
  DoctorService,
  PreferenceService,
} from "../../services/OfflineServices";
import { PdfService } from "../../services/PdfService";
import { Patient, Visit, MedicalTemplate } from "../../types/Storage";
import { calculateAge } from "../../utils/dateUtils";
import {
  computeWhoPercentileAltezza,
  computeWhoPercentilePeso,
} from "../../utils/whoPercentiles";
import {
  ArrowLeft,
  Printer,
  ClipboardList,
  AlertCircle,
  Save,
  User,
  Copy,
} from "lucide-react";
import { useToast } from "../../contexts/ToastContext";
import { Breadcrumb } from "../../components/Breadcrumb";
import { CodiceFiscaleValue } from "../../components/CodiceFiscaleValue";
import {
  getDoctorProfileIncompleteMessage,
  isDoctorProfileComplete,
} from "../../utils/doctorProfile";

const TemplateSelector = ({
  templates,
  onSelect,
  label = "Modello",
}: {
  templates: MedicalTemplate[];
  onSelect: (text: string) => void;
  label?: string;
}) => {
  if (templates.length === 0) return null;

  return (
    <Dropdown>
      <DropdownTrigger>
        <Button
          size="sm"
          variant="flat"
          color="primary"
          startContent={<ClipboardList size={14} />}
          className="h-7 text-xs font-medium"
        >
          {label}
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label="Medical Templates"
        onAction={(key) => {
          const selected = templates.find((t) => t.id === key);
          if (selected) onSelect(selected.text);
        }}
      >
        {templates.map((t) => (
          <DropdownItem
            key={t.id}
            description={t.text.substring(0, 50) + "..."}
          >
            {t.label}
          </DropdownItem>
        ))}
      </DropdownMenu>
    </Dropdown>
  );
};

const createDefaultVisitData = () => ({
  dataVisita: new Date().toISOString().slice(0, 10),
  tipo: "bilancio_salute" as
    | "bilancio_salute"
    | "patologia"
    | "controllo"
    | "urgenza",
  descrizioneClinica: "",
  anamnesi: "",
  anamnesiFisiologica: "",
  anamnesiPatologicaRemota: "",
  anamnesiProssima: "",
  esamiObiettivo: "",
  conclusioniDiagnostiche: "",
  terapie: "",
});

const createDefaultPediatriaData = () => ({
  peso: undefined as number | undefined,
  altezza: undefined as number | undefined,
  circonferenzaCranica: undefined as number | undefined,
  bmi: undefined as number | undefined,
  percentilePeso: "",
  percentileAltezza: "",
  percentileCC: "",
  allattamento: "",
  svezzamento: "",
  tappeSviluppo: "",
  stadioTurner: "",
  vaccinazioni: "",
  pressioneArteriosa: "",
  temperatura: "",
  saturazioneO2: "",
  altezzaPadre: undefined as number | undefined,
  altezzaMadre: undefined as number | undefined,
  altezzaStimataFigli: undefined as number | undefined,
  notePediatriche: "",
  immagini: [] as string[],
});

type GrowthPoint = { x: number; y: number };

const GrowthChart = ({
  points,
  arrivalPoint,
}: {
  points: GrowthPoint[];
  /** Punto finale “target” (altezza stimata) calcolato dai genitori. */
  arrivalPoint?: GrowthPoint;
}) => {
  const WIDTH = 520;
  const HEIGHT = 220;
  const PAD_X = 42;
  const PAD_TOP = 24;
  const PAD_BOTTOM = 38;

  if (!points || points.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Inserisci almeno un valore di <span className="font-medium">Altezza</span> per vedere il grafico.
      </p>
    );
  }

  const allX = arrivalPoint ? [...points.map((p) => p.x), arrivalPoint.x] : points.map((p) => p.x);
  const allY = arrivalPoint ? [...points.map((p) => p.y), arrivalPoint.y] : points.map((p) => p.y);

  const minX = Math.min(...allX);
  const maxX = Math.max(...allX);
  const rawMinY = Math.min(...allY);
  const rawMaxY = Math.max(...allY);

  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, rawMaxY - rawMinY);

  const minY = rawMinY - spanY * 0.1;
  const maxY = rawMaxY + spanY * 0.1;

  const xScale = (x: number) => PAD_X + ((x - minX) / spanX) * (WIDTH - PAD_X * 2);
  const yScale = (y: number) =>
    HEIGHT - PAD_BOTTOM - ((y - minY) / (maxY - minY)) * (HEIGHT - PAD_TOP - PAD_BOTTOM);

  const poly = points.map((p) => `${xScale(p.x)},${yScale(p.y)}`).join(" ");

  const first = points[0];
  const last = points[points.length - 1];

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto"
        role="img"
        aria-label="Grafico andamento crescita altezza"
      >
        <rect
          x="0.5"
          y="0.5"
          width={WIDTH - 1}
          height={HEIGHT - 1}
          rx="14"
          fill="white"
          stroke="#E5E7EB"
        />

        {/* Griglia + etichette assi (Y in cm, X in date) */}
        {Array.from({ length: 5 }).map((_, i) => {
          const t = i / 4; // 0..1
          const yPos = PAD_TOP + (HEIGHT - PAD_TOP - PAD_BOTTOM) * t;
          // In alto devono comparire i cm maggiori, in basso i minori.
          const yVal = maxY - (maxY - minY) * t;
          return (
            <g key={`y-${i}`}>
              <line
                x1={PAD_X}
                x2={WIDTH - PAD_X}
                y1={yPos}
                y2={yPos}
                stroke="#F3F4F6"
                strokeWidth="1"
              />
              <text
                x={PAD_X - 8}
                y={yPos + 3}
                textAnchor="end"
                fontSize="10"
                fontWeight="600"
                fill="#374151"
              >
                {Number.isFinite(yVal) ? `${Math.round(yVal)} cm` : ""}
              </text>
            </g>
          );
        })}

        {Array.from({ length: 4 }).map((_, i) => {
          const t = i / 3; // 0..1
          const ts = minX + (maxX - minX) * t;
          const xPos = xScale(ts);
          const label = new Date(ts).toLocaleDateString("it-IT", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
          });
          return (
            <g key={`x-${i}`}>
              <line
                x1={xPos}
                x2={xPos}
                y1={PAD_TOP}
                y2={HEIGHT - PAD_BOTTOM}
                stroke="#F3F4F6"
                strokeWidth="1"
              />
              <text
                x={xPos}
                y={HEIGHT - PAD_BOTTOM + 16}
                textAnchor={i === 0 ? "start" : i === 3 ? "end" : "middle"}
                fontSize="10"
                fontWeight="600"
                fill="#374151"
              >
                {label}
              </text>
            </g>
          );
        })}

        <polyline
          points={poly}
          fill="none"
          stroke="#2563EB"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {points.map((p, idx) => (
          <circle
            key={`${p.x}-${idx}`}
            cx={xScale(p.x)}
            cy={yScale(p.y)}
            r="4.2"
            fill="#2563EB"
            stroke="white"
            strokeWidth="2"
          />
        ))}

        {arrivalPoint && (
          (() => {
            const cx = xScale(arrivalPoint.x);
            const cy = yScale(arrivalPoint.y);
            // Diamante per evidenziare il target (altezza stimata)
            return (
              <polygon
                points={`${cx},${cy - 6} ${cx + 6},${cy} ${cx},${cy + 6} ${cx - 6},${cy}`}
                fill="#16A34A"
                stroke="white"
                strokeWidth="2"
              />
            );
          })()
        )}
      </svg>

    </div>
  );
};

export default function AddVisit() {
  const [searchParams] = useSearchParams();
  const { visitId } = useParams<{ visitId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [patientVisits, setPatientVisits] = useState<Visit[]>([]);
  const [existingVisit, setExistingVisit] = useState<Visit | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [copiedPreviousType, setCopiedPreviousType] = useState<string | null>(
    null,
  );

  const [pediatriaAnamnesiSplit, setPediatriaAnamnesiSplit] = useState(false);
  const [isPercentilePesoManual, setIsPercentilePesoManual] = useState(false);
  const [isPercentileAltezzaManual, setIsPercentileAltezzaManual] = useState(false);
  const [percentilePesoSuggested, setPercentilePesoSuggested] = useState<string>("");
  const [percentileAltezzaSuggested, setPercentileAltezzaSuggested] = useState<string>("");
  const initialLoadDone = useRef(false);

  const [allTemplates, setAllTemplates] = useState<MedicalTemplate[]>([]);
  const [visitData, setVisitData] = useState(createDefaultVisitData);
  const [pediatriaData, setPediatriaData] = useState(
    createDefaultPediatriaData,
  );

  useEffect(() => {
    // Preferenze locali per abilitare/disabilitare l'anamnesi in campi separati
    PreferenceService.getPreferences()
      .then((prefs) => {
        if (!prefs) return;
        setPediatriaAnamnesiSplit(Boolean(prefs.pediatriaAnamnesiSplit));
      })
      .catch(() => {
        // In caso di errore usiamo il valore di default
      });
  }, []);

  useEffect(() => {
    const loadData = async () => {
      initialLoadDone.current = false;
      setIsEditMode(false);
      setExistingVisit(null);
      setHasUnsavedChanges(false);
      setCopiedPreviousType(null);
      setError(null);
      setPatientVisits([]);
      setVisitData(createDefaultVisitData());
      setPediatriaData(createDefaultPediatriaData());
      setIsPercentilePesoManual(false);
      setIsPercentileAltezzaManual(false);
      setPercentilePesoSuggested("");
      setPercentileAltezzaSuggested("");

      try {
        const templates = await TemplateService.getAllTemplates();
        setAllTemplates(templates);
      } catch (e) {
        console.error("Errore caricamento template", e);
      }

      const loadPatientVisits = async (pId: string) => {
        const visitsData = await VisitService.getVisitsByPatientId(pId);
        const sortedVisits = visitsData.sort((a, b) => {
          const dateDiff =
            new Date(b.dataVisita).getTime() - new Date(a.dataVisita).getTime();
          if (dateDiff !== 0) return dateDiff;
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        });
        setPatientVisits(sortedVisits);
      };

      if (visitId) {
        setIsEditMode(true);
        try {
          const visit = await VisitService.getVisitById(visitId);
          if (visit) {
            setExistingVisit(visit);
            setVisitData({
              dataVisita: visit.dataVisita,
              tipo: (visit.tipo as any) || "bilancio_salute",
              descrizioneClinica: visit.descrizioneClinica || "",
              anamnesi: visit.anamnesi || "",
              anamnesiFisiologica:
                visit.anamnesiFisiologica || visit.anamnesi || "",
              anamnesiPatologicaRemota: visit.anamnesiPatologicaRemota || "",
              anamnesiProssima: visit.anamnesiProssima || "",
              esamiObiettivo: visit.esamiObiettivo || "",
              conclusioniDiagnostiche: [
                visit.conclusioniDiagnostiche,
                visit.terapie,
              ]
                .filter(Boolean)
                .join("\n\n"),
              terapie: "",
            });

            if (visit.pediatria) {
              setPediatriaData((prev) => ({ ...prev, ...visit.pediatria }));
              setIsPercentilePesoManual(Boolean(visit.pediatria.percentilePeso?.trim()));
              setIsPercentileAltezzaManual(Boolean(visit.pediatria.percentileAltezza?.trim()));
            }
            const patientData = await PatientService.getPatientById(
              visit.patientId,
            );
            setPatient(patientData);
            if (patientData) {
              // Se in visita mancano alcuni valori auxologici, li prendiamo dalla scheda paziente.
              setPediatriaData((prev) => ({
                ...prev,
                altezza: prev.altezza ?? patientData.altezza,
                altezzaPadre:
                  prev.altezzaPadre ?? patientData.altezzaPadre,
                altezzaMadre:
                  prev.altezzaMadre ?? patientData.altezzaMadre,
              }));
              await loadPatientVisits(patientData.id);
            }
          } else {
            setError("Visita non trovata");
          }
        } catch (error) {
          setError("Errore nel caricamento della visita");
        }
      } else {
        const patientId = searchParams.get("patientId");
        const patientCf = searchParams.get("patientCf");

        if (patientId) {
          try {
            const patientData = await PatientService.getPatientById(patientId);
            setPatient(patientData);
            // Precompila dati auxologici dalla scheda paziente (solo nuova visita).
            setPediatriaData((prev) => ({
              ...prev,
              peso: patientData.peso ?? prev.peso,
              altezza: patientData.altezza ?? prev.altezza,
              altezzaPadre: patientData.altezzaPadre ?? prev.altezzaPadre,
              altezzaMadre: patientData.altezzaMadre ?? prev.altezzaMadre,
            }));
            if (patientData) await loadPatientVisits(patientData.id);
          } catch (error) {
            setError("Errore nel caricamento dati paziente");
          }
        } else if (patientCf) {
          try {
            const patientData = await PatientService.getPatientByCF(patientCf);
            setPatient(patientData);
            setPediatriaData((prev) => ({
              ...prev,
              peso: patientData.peso ?? prev.peso,
              altezza: patientData.altezza ?? prev.altezza,
              altezzaPadre: patientData.altezzaPadre ?? prev.altezzaPadre,
              altezzaMadre: patientData.altezzaMadre ?? prev.altezzaMadre,
            }));
            if (patientData) await loadPatientVisits(patientData.id);
          } catch (error) {
            setError("Errore nel caricamento dati paziente");
          }
        }
      }
      setTimeout(() => {
        initialLoadDone.current = true;
      }, 300);
    };
    loadData();
  }, [searchParams, visitId]);

  useEffect(() => {
    if (!patient) return;
    if (visitData.tipo !== "bilancio_salute") return;

    let cancelled = false;

    (async () => {
      const birthDateIso = patient.dataNascita;
      const referenceDateIso = visitData.dataVisita;

      const currentPeso = pediatriaData.peso;
      const currentAltezza = pediatriaData.altezza;

      let newPercentilePeso = "";
      if (currentPeso != null && Number.isFinite(currentPeso)) {
        newPercentilePeso = (await computeWhoPercentilePeso({
          birthDateIso,
          referenceDateIso,
          sex: patient.sesso,
          weightKg: currentPeso,
        })) ?? "";
      }

      let newPercentileAltezza = "";
      if (currentAltezza != null && Number.isFinite(currentAltezza)) {
        newPercentileAltezza = (await computeWhoPercentileAltezza({
          birthDateIso,
          referenceDateIso,
          sex: patient.sesso,
          heightCm: currentAltezza,
        })) ?? "";
      }

      if (cancelled) return;

      // Non sovrascrivo mai il valore inserito dall'utente.
      // Aggiorno solo la "suggestion" da mostrare come Chip.
      setPercentilePesoSuggested(newPercentilePeso);
      setPercentileAltezzaSuggested(newPercentileAltezza);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    patient,
    visitData.tipo,
    visitData.dataVisita,
    pediatriaData.peso,
    pediatriaData.altezza,
  ]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) e.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const handleTemplateSelect = (field: string, text: string) => {
    setVisitData((prev) => ({
      ...prev,
      [field]: prev[field as keyof typeof prev]
        ? `${prev[field as keyof typeof prev]}\n${text}`
        : text,
    }));
  };

  const handleSubmit = async (
    e?: React.FormEvent | { preventDefault: () => void },
  ) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!patient) {
      setError("Nessun paziente selezionato");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const doctor = await DoctorService.getDoctor();
      if (!isDoctorProfileComplete(doctor)) {
        const message = getDoctorProfileIncompleteMessage(doctor);
        setError(message);
        showToast(message, "error");
        return;
      }

      const visitToSave = {
        patientId: patient.id,
        dataVisita: visitData.dataVisita,
        descrizioneClinica: visitData.descrizioneClinica,
        anamnesi: (() => {
          if (!pediatriaAnamnesiSplit) return visitData.anamnesi;
          const fisiologica = (visitData.anamnesiFisiologica || "").trim();
          const remota = (visitData.anamnesiPatologicaRemota || "").trim();
          const prossima = (visitData.anamnesiProssima || "").trim();
          const parts = [];
          if (fisiologica) parts.push(`1. Fisiologica\n${fisiologica}`);
          if (remota) parts.push(`2. Patologica remota\n${remota}`);
          if (prossima) parts.push(`3. Prossima\n${prossima}`);
          return parts.join("\n\n");
        })(),
        esamiObiettivo: visitData.esamiObiettivo,
        conclusioniDiagnostiche: visitData.conclusioniDiagnostiche,
        terapie: "",
        tipo: visitData.tipo as any,
        ...(pediatriaAnamnesiSplit
          ? {
              anamnesiFisiologica: visitData.anamnesiFisiologica,
              anamnesiPatologicaRemota: visitData.anamnesiPatologicaRemota,
              anamnesiProssima: visitData.anamnesiProssima,
            }
          : {}),
        pediatria: pediatriaData,
      };

      if (isEditMode && existingVisit) {
        await VisitService.updateVisit(existingVisit.id, visitToSave);
        // Mantieni coerenti i dati auxologici anche nella scheda paziente.
        await PatientService.updatePatient(patient.id, {
          peso: pediatriaData.peso,
          altezza: pediatriaData.altezza,
          altezzaPadre: pediatriaData.altezzaPadre,
          altezzaMadre: pediatriaData.altezzaMadre,
        });
        setHasUnsavedChanges(false);
        showToast("Visita aggiornata con successo!");
      } else {
        await VisitService.addVisit(visitToSave);
        await PatientService.updatePatient(patient.id, {
          peso: pediatriaData.peso,
          altezza: pediatriaData.altezza,
          altezzaPadre: pediatriaData.altezzaPadre,
          altezzaMadre: pediatriaData.altezzaMadre,
        });
        setHasUnsavedChanges(false);
        showToast("Visita salvata con successo!");
      }
      setTimeout(() => navigate(`/patient-history/${patient.id}`), 1000);
    } catch (error) {
      console.error("Errore nel salvataggio visita:", error);
      setError(
        isEditMode
          ? "Errore nell'aggiornamento della visita"
          : "Errore nel salvataggio della visita",
      );
    } finally {
      setLoading(false);
    }
  };

  const getPreviousVisitByType = (tipo: string) => {
    return patientVisits.find(
      (v) => v.tipo === tipo && (!existingVisit || v.id !== existingVisit.id),
    );
  };

  const handleCopyPreviousVisit = () => {
    const currentType = visitData.tipo as string;

    if (copiedPreviousType === currentType) {
      setVisitData((prev) => ({
        ...prev,
        descrizioneClinica: "",
        anamnesi: "",
        anamnesiFisiologica: "",
        anamnesiPatologicaRemota: "",
        anamnesiProssima: "",
        esamiObiettivo: "",
        conclusioniDiagnostiche: "",
        terapie: "",
      }));
      setPediatriaData(createDefaultPediatriaData());
      setCopiedPreviousType(null);
      setHasUnsavedChanges(true);
      showToast("Campi svuotati.");
      return;
    }

    const previousVisit = getPreviousVisitByType(currentType);
    if (!previousVisit) {
      showToast(`Nessuna visita precedente trovata per questo tipo.`, "info");
      return;
    }

    setVisitData((prev) => ({
      ...prev,
      descrizioneClinica: previousVisit.descrizioneClinica || "",
      anamnesi: previousVisit.anamnesi || "",
      anamnesiFisiologica:
        (previousVisit as any).anamnesiFisiologica || previousVisit.anamnesi || "",
      anamnesiPatologicaRemota:
        (previousVisit as any).anamnesiPatologicaRemota || "",
      anamnesiProssima:
        (previousVisit as any).anamnesiProssima || "",
      esamiObiettivo: previousVisit.esamiObiettivo || "",
      conclusioniDiagnostiche: previousVisit.conclusioniDiagnostiche || "",
      terapie: previousVisit.terapie || "",
    }));
    if (previousVisit.pediatria) {
      // Copia dati pediatrici senza gestire immagini (sezione rimossa).
      setPediatriaData((prev) => ({ ...prev, ...previousVisit.pediatria }));
    }

    setHasUnsavedChanges(true);
    setCopiedPreviousType(currentType);
    showToast(
      `Campi copiati dall'ultima visita ${currentType.replace("_", " ")}.`,
    );
  };

  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        resolve((dataUrl && dataUrl.split(",")[1]) ?? "");
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const handlePrintPdf = async () => {
    if (!patient) return;

    const currentVisit: Visit = {
      id: existingVisit?.id || "",
      patientId: patient.id,
      dataVisita: visitData.dataVisita,
      descrizioneClinica: visitData.descrizioneClinica,
      anamnesi: (() => {
        if (!pediatriaAnamnesiSplit) return visitData.anamnesi;
        const fisiologica = (visitData.anamnesiFisiologica || "").trim();
        const remota = (visitData.anamnesiPatologicaRemota || "").trim();
        const prossima = (visitData.anamnesiProssima || "").trim();
        const parts = [];
        if (fisiologica) parts.push(`1. Fisiologica\n${fisiologica}`);
        if (remota) parts.push(`2. Patologica remota\n${remota}`);
        if (prossima) parts.push(`3. Prossima\n${prossima}`);
        return parts.join("\n\n");
      })(),
      esamiObiettivo: visitData.esamiObiettivo,
      conclusioniDiagnostiche: visitData.conclusioniDiagnostiche,
      terapie: visitData.terapie,
      tipo: visitData.tipo as any,
      pediatria: pediatriaData,
      createdAt: existingVisit?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setPdfLoading(true);
    try {
      const includeGrowthChart = window.confirm(
        "Nel PDF vuoi includere il grafico andamento crescita?"
      );
      const blob = await (PdfService as any).generatePediatricPDF?.(
        patient,
        currentVisit,
        { includeGrowthChart },
      );
      if (!blob) {
        showToast(
          "Impossibile generare il PDF per la stampa. Assicurati che generatePediatricPDF sia implementato in PdfService.",
          "error",
        );
        return;
      }
      const electronAPI = (
        window as unknown as {
          electronAPI?: { openPdfForPrint: (b64: string) => Promise<unknown> };
        }
      ).electronAPI;
      if (electronAPI?.openPdfForPrint) {
        const base64 = await blobToBase64(blob);
        await electronAPI.openPdfForPrint(base64);
        showToast("PDF aperto nell'app predefinita. Usa Stampa da lì.");
      } else {
        const pdfUrl = URL.createObjectURL(blob);
        const w = window.open(pdfUrl, "_blank");
        if (w) {
          setTimeout(() => URL.revokeObjectURL(pdfUrl), 5000);
        } else {
          const filename = `Pediatria_${patient.cognome}_${currentVisit.dataVisita}.pdf`;
          const a = document.createElement("a");
          a.href = pdfUrl;
          a.download = filename;
          a.click();
          URL.revokeObjectURL(pdfUrl);
          showToast(
            "PDF scaricato. Apri il file per visualizzarlo e stampare.",
          );
        }
      }
    } catch (err) {
      console.error("Errore stampa PDF:", err);
      showToast("Errore durante la stampa del PDF.", "error");
    } finally {
      setPdfLoading(false);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    if (initialLoadDone.current) setHasUnsavedChanges(true);
    if (field === "tipo") {
      setCopiedPreviousType(null);
    }
    setVisitData((prev) => ({ ...prev, [field]: value }));
  };

  const handlePediatriaChange = (field: string, value: any) => {
    if (initialLoadDone.current) setHasUnsavedChanges(true);
    setPediatriaData((prev) => ({ ...prev, [field]: value }));
  };

  const handleNavigateCronologia = () => {
    if (
      hasUnsavedChanges &&
      !window.confirm("Modifiche non salvate. Uscire comunque?")
    )
      return;
    navigate(`/patient-history/${patient?.id}`);
  };

  if (!patient) {
    return (
      <Card className="max-w-2xl mx-auto mt-12 shadow-medium">
        <CardBody className="text-center py-12">
          <div className="w-20 h-20 bg-default-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <User size={40} className="text-default-400" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Nessun paziente selezionato
          </h2>
          <p className="text-gray-500 mb-6">
            Seleziona un paziente dalla dashboard per creare una nuova visita
          </p>
          <Button
            color="primary"
            onPress={() => navigate("/")}
            startContent={<ArrowLeft size={18} />}
          >
            Torna alla Dashboard
          </Button>
        </CardBody>
      </Card>
    );
  }

  const breadcrumbItems = [
    { label: "Dashboard", path: "/" },
    { label: "Pazienti", path: "/pazienti" },
    {
      label: `${patient.nome} ${patient.cognome}`,
      path: `/patient-history/${patient.id}`,
    },
    { label: isEditMode ? "Modifica visita" : "Nuova visita pediatrica" },
  ];

  const hasPreviousVisitForCurrentType = Boolean(
    getPreviousVisitByType(visitData.tipo),
  );
  const canCopyOrClear =
    hasPreviousVisitForCurrentType || copiedPreviousType === visitData.tipo;

  const growthPoints = (() => {
    const saved = patientVisits
      .filter((v) => v.pediatria?.altezza != null)
      .filter((v) => !existingVisit || v.id !== existingVisit.id)
      .map((v) => ({
        x: new Date(v.dataVisita).getTime(),
        y: v.pediatria?.altezza as number,
      }));

    const current =
      pediatriaData.altezza != null
        ? [
            {
              x: new Date(visitData.dataVisita).getTime(),
              y: pediatriaData.altezza as number,
            },
          ]
        : [];

    return [...saved, ...current]
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
      .sort((a, b) => a.x - b.x);
  })();

  const arrivalPoint = (() => {
    const manualEst = pediatriaData.altezzaStimataFigli;
    if (manualEst != null && Number.isFinite(manualEst)) {
      const x = new Date(visitData.dataVisita).getTime() + 1;
      return { x, y: Number(manualEst.toFixed(1)) };
    }

    const father = pediatriaData.altezzaPadre;
    const mother = pediatriaData.altezzaMadre;
    if (!patient?.sesso) return undefined;
    if (
      father == null ||
      mother == null ||
      !Number.isFinite(father) ||
      !Number.isFinite(mother)
    ) {
      return undefined;
    }

    const sum = father + mother;
    const est = patient.sesso === "M" ? (sum + 13) / 2 : (sum - 13) / 2;
    if (!Number.isFinite(est)) return undefined;

    const x = new Date(visitData.dataVisita).getTime() + 1; // spostato di poco per non sovrapporsi all’ultimo punto
    return { x, y: Number(est.toFixed(1)) };
  })();

  return (
    <div className="max-w-[1200px] mx-auto space-y-6 pb-32">
      <Breadcrumb items={breadcrumbItems} />

      <Card className="shadow-md border-t-4 border-primary">
        <CardBody className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl shrink-0">
              {patient.nome[0]}
              {patient.cognome[0]}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                {patient.nome} {patient.cognome}
                {hasUnsavedChanges && (
                  <Chip size="sm" color="warning" variant="flat">
                    Non salvato
                  </Chip>
                )}
              </h1>
              <p className="text-sm text-gray-500 flex items-center gap-2 flex-wrap">
                <span className="text-gray-500">
                  <CodiceFiscaleValue
                    value={patient.codiceFiscale}
                    generatedFromImport={Boolean(patient.codiceFiscaleGenerato)}
                  />
                </span>
                {calculateAge(patient.dataNascita) && (
                  <>
                    <span className="hidden md:inline text-gray-300">|</span>
                    <span className="text-gray-500">
                      {calculateAge(patient.dataNascita)}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <Input
              type="date"
              label="Data Visita"
              value={visitData.dataVisita}
              onValueChange={(value) => handleInputChange("dataVisita", value)}
              variant="bordered"
              size="sm"
              labelPlacement="outside-left"
              className="w-full md:w-auto"
              classNames={{
                label: "text-gray-500 font-medium whitespace-nowrap pt-2",
                input: "bg-transparent",
                inputWrapper:
                  "border-default-300 hover:border-primary focus-within:border-primary min-w-[140px]",
              }}
            />
          </div>
        </CardBody>
      </Card>

      {error && (
        <Card className="border-l-4 border-l-danger bg-danger-50">
          <CardBody className="py-3">
            <p className="text-danger text-sm font-medium flex items-center gap-2">
              <AlertCircle size={16} />
              {error}
            </p>
          </CardBody>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {!isEditMode && (
          <div className="flex justify-end">
            <Button
              color="primary"
              variant="flat"
              size="sm"
              onPress={handleCopyPreviousVisit}
              isDisabled={!canCopyOrClear}
              startContent={<Copy size={16} />}
            >
              {copiedPreviousType === visitData.tipo
                ? "Svuota campi"
                : "Copia visita precedente"}
            </Button>
          </div>
        )}

        <Tabs
          selectedKey={visitData.tipo}
          onSelectionChange={(key) => handleInputChange("tipo", key)}
          size="lg"
          color="primary"
          variant="underlined"
          classNames={{
            base: "w-full border-b border-divider",
            tabList: "gap-8 w-full relative rounded-none p-0",
            cursor: "w-full bg-primary h-[3px]",
            tab: "max-w-fit px-2 h-12 text-lg",
            tabContent:
              "group-data-[selected=true]:text-primary group-data-[selected=true]:font-bold text-gray-500 font-medium",
          }}
        >
          <Tab key="bilancio_salute" title="Visita pediatrica" />
          {isEditMode && visitData.tipo === "patologia" && (
            <Tab key="patologia" title="Visita per Patologia" />
          )}
          <Tab key="controllo" title="Visita di Controllo" />
        </Tabs>

        {/* Form Unificato per tutte le visite pediatriche */}
        <div className="flex flex-col lg:flex-row gap-6 mt-6">
          {/* LEFT COLUMN: Parametri e Nutrizione */}
          <div className="w-full lg:w-[32%] min-w-[300px] space-y-6">
            <Card className="shadow-sm border border-default-200 bg-white">
              <CardHeader className="pb-0 pt-4 px-4 font-semibold text-gray-700 uppercase text-xs tracking-wider">
                Parametri Auxologici & Vitali
              </CardHeader>
              <CardBody className="px-4 py-4 space-y-4">
                {visitData.tipo === "bilancio_salute" ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        type="number"
                        label="Peso (kg)"
                        value={pediatriaData.peso?.toString() || ""}
                        onValueChange={(v) =>
                          handlePediatriaChange("peso", parseFloat(v) || undefined)
                        }
                        variant="bordered"
                        size="sm"
                        labelPlacement="outside"
                        placeholder="es. 12.5"
                        step="0.01"
                      />
                      <div className="relative">
                          <Input
                            type="text"
                            label="Percentile Peso"
                            value={pediatriaData.percentilePeso}
                            variant="bordered"
                            size="sm"
                            labelPlacement="outside"
                            placeholder="es. 50"
                            onValueChange={(v) => {
                              const trimmed = (v ?? "").toString().trim();
                              setIsPercentilePesoManual(trimmed.length > 0);
                              handlePediatriaChange(
                                "percentilePeso",
                                trimmed.length > 0 ? v : "",
                              );
                            }}
                          />
                          {percentilePesoSuggested && (
                            <div className="absolute right-0 -top-0.5 z-10">
                              <Chip
                                size="sm"
                                color="primary"
                                variant="flat"
                                className="cursor-pointer hover:bg-primary/20 h-6 px-1"
                                onClick={() => {
                                  setIsPercentilePesoManual(true);
                                  handlePediatriaChange(
                                    "percentilePeso",
                                    percentilePesoSuggested,
                                  );
                                }}
                              >
                                Suggerito: {percentilePesoSuggested}°
                              </Chip>
                            </div>
                          )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        type="number"
                        label="Altezza (cm)"
                        value={pediatriaData.altezza?.toString() || ""}
                        onValueChange={(v) =>
                          handlePediatriaChange("altezza", parseFloat(v) || undefined)
                        }
                        variant="bordered"
                        size="sm"
                        labelPlacement="outside"
                        placeholder="es. 80.0"
                        step="0.1"
                      />
                      <div className="relative">
                          <Input
                            type="text"
                            label="Percentile Altezza"
                            value={pediatriaData.percentileAltezza}
                            variant="bordered"
                            size="sm"
                            labelPlacement="outside"
                            placeholder="es. 50"
                            onValueChange={(v) => {
                              const trimmed = (v ?? "").toString().trim();
                              setIsPercentileAltezzaManual(trimmed.length > 0);
                              handlePediatriaChange(
                                "percentileAltezza",
                                trimmed.length > 0 ? v : "",
                              );
                            }}
                          />
                          {percentileAltezzaSuggested && (
                            <div className="absolute right-0 -top-0.5 z-10">
                              <Chip
                                size="sm"
                                color="primary"
                                variant="flat"
                                className="cursor-pointer hover:bg-primary/20 h-6 px-1"
                                onClick={() => {
                                  setIsPercentileAltezzaManual(true);
                                  handlePediatriaChange(
                                    "percentileAltezza",
                                    percentileAltezzaSuggested,
                                  );
                                }}
                              >
                                Suggerito: {percentileAltezzaSuggested}°
                              </Chip>
                            </div>
                          )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      type="number"
                      label="Peso (kg)"
                      value={pediatriaData.peso?.toString() || ""}
                      onValueChange={(v) =>
                        handlePediatriaChange(
                          "peso",
                          parseFloat(v) || undefined,
                        )
                      }
                      variant="bordered"
                      size="sm"
                      labelPlacement="outside"
                      placeholder="es. 12.5"
                      step="0.01"
                    />
                    <Input
                      type="number"
                      label="Altezza (cm)"
                      value={pediatriaData.altezza?.toString() || ""}
                      onValueChange={(v) =>
                        handlePediatriaChange(
                          "altezza",
                          parseFloat(v) || undefined,
                        )
                      }
                      variant="bordered"
                      size="sm"
                      labelPlacement="outside"
                      placeholder="es. 80.0"
                      step="0.1"
                    />
                  </div>
                )}
                {visitData.tipo === "bilancio_salute" && (
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      type="number"
                      label="Circonferenza Cranica (cm)"
                      value={
                        pediatriaData.circonferenzaCranica?.toString() || ""
                      }
                      onValueChange={(v) =>
                        handlePediatriaChange(
                          "circonferenzaCranica",
                          parseFloat(v) || undefined,
                        )
                      }
                      variant="bordered"
                      size="sm"
                      labelPlacement="outside"
                      placeholder="es. 34.5"
                      step="0.1"
                    />
                    <Input
                      type="text"
                      label="Percentile CC"
                      value={pediatriaData.percentileCC}
                      onValueChange={(v) =>
                        handlePediatriaChange("percentileCC", v)
                      }
                      variant="bordered"
                      size="sm"
                      labelPlacement="outside"
                      placeholder="es. 50°"
                    />
                  </div>
                )}
                <Divider />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    type="text"
                    label="Stadio di Turner"
                    value={pediatriaData.stadioTurner || ""}
                    onValueChange={(v) =>
                      handlePediatriaChange("stadioTurner", v)
                    }
                    variant="bordered"
                    size="sm"
                    labelPlacement="outside"
                    placeholder="es. stadio puberale / descrizione libera"
                  />
                  <Input
                    type="text"
                    label="Pressione Arteriosa"
                    value={pediatriaData.pressioneArteriosa}
                    onValueChange={(v) =>
                      handlePediatriaChange("pressioneArteriosa", v)
                    }
                    variant="bordered"
                    size="sm"
                    labelPlacement="outside"
                    placeholder="es. 100/60"
                  />
                </div>

                {(() => {
                  const hasFather = patient.altezzaPadre != null && Number.isFinite(patient.altezzaPadre);
                  const hasMother = patient.altezzaMadre != null && Number.isFinite(patient.altezzaMadre);

                  const showFather = !hasFather;
                  const showMother = !hasMother;

                  // Se entrambi presenti in scheda paziente, non li chiediamo più.
                  if (!showFather && !showMother) {
                    // Non mostriamo nulla qui: i genitori sono già presenti in scheda paziente.
                    return null;
                  }

                  return (
                    <div className={`grid gap-3 pt-2 ${showFather && showMother ? "grid-cols-2" : "grid-cols-1"}`}>
                      {showFather && (
                        <Input
                          type="number"
                          label="Altezza padre (cm)"
                          value={pediatriaData.altezzaPadre?.toString() || ""}
                          onValueChange={(v) =>
                            handlePediatriaChange(
                              "altezzaPadre",
                              parseFloat(v) || undefined,
                            )
                          }
                          variant="bordered"
                          size="sm"
                          labelPlacement="outside"
                          placeholder="es. 175"
                          step="0.1"
                        />
                      )}
                      {showMother && (
                        <Input
                          type="number"
                          label="Altezza madre (cm)"
                          value={pediatriaData.altezzaMadre?.toString() || ""}
                          onValueChange={(v) =>
                            handlePediatriaChange(
                              "altezzaMadre",
                              parseFloat(v) || undefined,
                            )
                          }
                          variant="bordered"
                          size="sm"
                          labelPlacement="outside"
                          placeholder="es. 162"
                          step="0.1"
                        />
                      )}
                    </div>
                  );
                })()}
              </CardBody>
            </Card>

            <Card className="shadow-sm border border-default-200 bg-white">
              <CardHeader className="pb-0 pt-4 px-4 font-semibold text-gray-700 uppercase text-xs tracking-wider">
                Grafico andamento crescita
              </CardHeader>
              <CardBody className="px-4 py-4">
                {/* Il grafico usa le altezze salvate nelle visite del paziente */}
                <GrowthChart points={growthPoints} arrivalPoint={arrivalPoint} />
              </CardBody>
            </Card>
          </div>

          {/* RIGHT COLUMN: Referto Testuale Main */}
          <div className="w-full lg:flex-1 space-y-6">
            <Card className="shadow-sm border border-default-200 bg-white">
              <CardHeader className="pb-0 pt-4 px-6 font-semibold text-gray-700 uppercase text-xs tracking-wider">
                Referto Medico
              </CardHeader>
              <CardBody className="p-6 space-y-8">
                {/* 1. Anamnesi */}
                {pediatriaAnamnesiSplit ? (
                  <div className="space-y-4">
                    <div className="space-y-2 relative group">
                      <div className="flex justify-between items-end mb-1">
                        <label className="text-sm font-bold text-gray-700">
                          1. Fisiologica
                        </label>
                        <TemplateSelector
                          templates={allTemplates.filter(
                            (t) =>
                              t.category === visitData.tipo &&
                              t.section === "anamnesi",
                          )}
                          onSelect={(t) =>
                            handleTemplateSelect("anamnesiFisiologica", t)
                          }
                        />
                      </div>
                      <Textarea
                        value={visitData.anamnesiFisiologica}
                        onValueChange={(value) =>
                          handleInputChange("anamnesiFisiologica", value)
                        }
                        variant="bordered"
                        minRows={2}
                        classNames={{
                          input: "text-base leading-relaxed",
                          inputWrapper:
                            "group-hover:border-primary transition-colors bg-white",
                        }}
                      />
                    </div>

                    <div className="space-y-2 relative group">
                      <div className="flex justify-between items-end mb-1">
                        <label className="text-sm font-bold text-gray-700">
                          2. Patologica remota
                        </label>
                        <TemplateSelector
                          templates={allTemplates.filter(
                            (t) =>
                              t.category === visitData.tipo &&
                              t.section === "anamnesi",
                          )}
                          onSelect={(t) =>
                            handleTemplateSelect(
                              "anamnesiPatologicaRemota",
                              t,
                            )
                          }
                        />
                      </div>
                      <Textarea
                        value={visitData.anamnesiPatologicaRemota}
                        onValueChange={(value) =>
                          handleInputChange(
                            "anamnesiPatologicaRemota",
                            value,
                          )
                        }
                        variant="bordered"
                        minRows={2}
                        classNames={{
                          input: "text-base leading-relaxed",
                          inputWrapper:
                            "group-hover:border-primary transition-colors bg-white",
                        }}
                      />
                    </div>

                    <div className="space-y-2 relative group">
                      <div className="flex justify-between items-end mb-1">
                        <label className="text-sm font-bold text-gray-700">
                          3. Prossima
                        </label>
                        <TemplateSelector
                          templates={allTemplates.filter(
                            (t) =>
                              t.category === visitData.tipo &&
                              t.section === "anamnesi",
                          )}
                          onSelect={(t) =>
                            handleTemplateSelect("anamnesiProssima", t)
                          }
                        />
                      </div>
                      <Textarea
                        value={visitData.anamnesiProssima}
                        onValueChange={(value) =>
                          handleInputChange("anamnesiProssima", value)
                        }
                        variant="bordered"
                        minRows={2}
                        classNames={{
                          input: "text-base leading-relaxed",
                          inputWrapper:
                            "group-hover:border-primary transition-colors bg-white",
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 relative group">
                    <div className="flex justify-between items-end mb-1">
                      <label className="text-sm font-bold text-gray-700">
                        1. Anamnesi
                      </label>
                      <TemplateSelector
                        templates={allTemplates.filter(
                          (t) =>
                            t.category === visitData.tipo &&
                            t.section === "anamnesi",
                        )}
                        onSelect={(t) => handleTemplateSelect("anamnesi", t)}
                      />
                    </div>
                    <Textarea
                      value={visitData.anamnesi}
                      onValueChange={(value) =>
                        handleInputChange("anamnesi", value)
                      }
                      variant="bordered"
                      minRows={3}
                      classNames={{
                        input: "text-base leading-relaxed",
                        inputWrapper:
                          "group-hover:border-primary transition-colors bg-white",
                      }}
                    />
                  </div>
                )}

                {/* Descrizione Problema / Dati Clinici (numerazione dinamica) */}
                <div className="space-y-2 group">
                  <label className="text-sm font-bold text-gray-700 block mb-1">
                    {pediatriaAnamnesiSplit
                      ? "4. Patologica prossima"
                      : "2. Patologica prossima"}
                  </label>
                  <Textarea
                    value={visitData.descrizioneClinica}
                    onValueChange={(value) =>
                      handleInputChange("descrizioneClinica", value)
                    }
                    variant="bordered"
                    minRows={3}
                    classNames={{
                      input: "text-base leading-relaxed",
                      inputWrapper:
                        "group-hover:border-primary transition-colors bg-white",
                    }}
                  />
                </div>

                {/* Visita (numerazione dinamica) */}
                <div className="space-y-2 relative group">
                  <div className="flex justify-between items-end mb-1">
                    <label className="text-sm font-bold text-gray-700">
                      {pediatriaAnamnesiSplit ? "5. Visita" : "3. Visita"}
                    </label>
                    <TemplateSelector
                      templates={allTemplates.filter(
                        (t) =>
                          t.category === visitData.tipo &&
                          t.section === "esameObiettivo",
                      )}
                      onSelect={(t) =>
                        handleTemplateSelect("esamiObiettivo", t)
                      }
                    />
                  </div>
                  <Textarea
                    value={visitData.esamiObiettivo}
                    onValueChange={(value) =>
                      handleInputChange("esamiObiettivo", value)
                    }
                    variant="bordered"
                    minRows={4}
                    classNames={{
                      input: "text-base leading-relaxed",
                      inputWrapper:
                        "group-hover:border-primary transition-colors bg-white",
                    }}
                  />
                </div>

                {/* Conclusioni e Terapie (numerazione dinamica) */}
                <div className="space-y-2 relative group">
                  <div className="flex justify-between items-end mb-1">
                    <label className="text-sm font-bold text-gray-700">
                      {pediatriaAnamnesiSplit
                        ? "6. Conclusioni e Terapie"
                        : "4. Conclusioni e Terapie"}
                    </label>
                    <TemplateSelector
                      templates={allTemplates.filter(
                        (t) =>
                          t.category === visitData.tipo &&
                          t.section === "conclusioni",
                      )}
                      onSelect={(t) =>
                        handleTemplateSelect("conclusioniDiagnostiche", t)
                      }
                    />
                  </div>
                  <Textarea
                    value={visitData.conclusioniDiagnostiche}
                    onValueChange={(value) =>
                      handleInputChange("conclusioniDiagnostiche", value)
                    }
                    variant="bordered"
                    minRows={4}
                    classNames={{
                      input: "text-base leading-relaxed",
                      inputWrapper:
                        "group-hover:border-primary transition-colors bg-white",
                    }}
                  />
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      </form>

      {/* Floating Action Bar */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex justify-center w-full pointer-events-none">
        <div className="bg-white/90 backdrop-blur-md border border-gray-200 shadow-2xl rounded-full px-6 py-3 flex items-center gap-6 pointer-events-auto transition-all hover:shadow-xl hover:scale-[1.01]">
          <Button
            variant="light"
            color="danger"
            size="sm"
            onPress={handleNavigateCronologia}
            startContent={<ArrowLeft size={16} />}
            className="text-gray-600 hover:text-danger font-medium"
          >
            Annulla
          </Button>
          <div className="h-6 w-px bg-gray-300" />
          <div className="flex gap-3">
            <Button
              color="secondary"
              variant="flat"
              size="md"
              onPress={handlePrintPdf}
              isLoading={pdfLoading}
              isDisabled={pdfLoading}
              startContent={<Printer size={18} />}
              className="rounded-full"
            >
              Stampa
            </Button>
            <Button
              onPress={() => handleSubmit()}
              color="success"
              size="md"
              className="px-6 font-bold text-white shadow-lg shadow-success/20 rounded-full"
              isLoading={loading}
              isDisabled={loading}
              startContent={<Save size={18} />}
            >
              {loading ? "Salvando..." : "Salva Visita"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

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
  Select,
  SelectItem,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
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
} from "../../services/OfflineServices";
import { PdfService } from "../../services/PdfService";
import { Patient, Visit, MedicalTemplate } from "../../types/Storage";
import { calculateAge } from "../../utils/dateUtils";
import {
  ArrowLeft,
  Printer,
  ClipboardList,
  AlertCircle,
  Save,
  User,
  ImagePlus,
  Trash2,
  Copy,
  X,
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
  vaccinazioni: "",
  pressioneArteriosa: "",
  temperatura: "",
  saturazioneO2: "",
  notePediatriche: "",
  immagini: [] as string[],
});

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
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [isIncludeImagesModalOpen, setIsIncludeImagesModalOpen] =
    useState(false);
  const [includeImagesCount, setIncludeImagesCount] = useState(0);
  const [copiedPreviousType, setCopiedPreviousType] = useState<string | null>(
    null,
  );
  const includeImagesResolverRef = useRef<((value: boolean) => void) | null>(
    null,
  );
  const initialLoadDone = useRef(false);

  const [allTemplates, setAllTemplates] = useState<MedicalTemplate[]>([]);
  const [visitData, setVisitData] = useState(createDefaultVisitData);
  const [pediatriaData, setPediatriaData] = useState(
    createDefaultPediatriaData,
  );

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
            }
            const patientData = await PatientService.getPatientById(
              visit.patientId,
            );
            setPatient(patientData);
            if (patientData) await loadPatientVisits(patientData.id);
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
            if (patientData) await loadPatientVisits(patientData.id);
          } catch (error) {
            setError("Errore nel caricamento dati paziente");
          }
        } else if (patientCf) {
          try {
            const patientData = await PatientService.getPatientByCF(patientCf);
            setPatient(patientData);
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
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) e.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && fullscreenImage) {
        setFullscreenImage(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreenImage]);

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
        anamnesi: visitData.anamnesi,
        esamiObiettivo: visitData.esamiObiettivo,
        conclusioniDiagnostiche: visitData.conclusioniDiagnostiche,
        terapie: "",
        tipo: visitData.tipo as any,
        pediatria: pediatriaData,
      };

      if (isEditMode && existingVisit) {
        await VisitService.updateVisit(existingVisit.id, visitToSave);
        setHasUnsavedChanges(false);
        showToast("Visita aggiornata con successo!");
      } else {
        await VisitService.addVisit(visitToSave);
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
      esamiObiettivo: previousVisit.esamiObiettivo || "",
      conclusioniDiagnostiche: previousVisit.conclusioniDiagnostiche || "",
      terapie: previousVisit.terapie || "",
    }));

    if (previousVisit.pediatria) {
      setPediatriaData((prev) => ({
        ...prev,
        ...previousVisit.pediatria,
        immagini: previousVisit.pediatria?.immagini ?? [],
      }));
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

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleImagesUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const maxImages = 8;
    const maxFileSize = 7 * 1024 * 1024;

    const currentImages = pediatriaData.immagini ?? [];

    if (currentImages.length >= maxImages) {
      showToast(
        `Hai già raggiunto il massimo di ${maxImages} immagini.`,
        "info",
      );
      return;
    }

    try {
      const validFiles = Array.from(files).filter((file) => {
        if (!file.type.startsWith("image/")) return false;
        if (file.size > maxFileSize) {
          showToast(`File "${file.name}" troppo grande (max 7MB).`, "info");
          return false;
        }
        return true;
      });

      const availableSlots = Math.max(0, maxImages - currentImages.length);
      const filesToLoad = validFiles.slice(0, availableSlots);
      const encoded = await Promise.all(filesToLoad.map(fileToDataUrl));

      setPediatriaData((prev) => ({
        ...prev,
        immagini: [...(prev.immagini ?? []), ...encoded],
      }));

      if (initialLoadDone.current) setHasUnsavedChanges(true);
      if (encoded.length > 0)
        showToast(`${encoded.length} immagine/i caricata/e.`);
    } catch (err) {
      console.error("Errore caricamento immagini:", err);
      showToast("Errore durante il caricamento delle immagini.", "error");
    }
  };

  const handleRemoveImage = (imageIndex: number) => {
    setPediatriaData((prev) => ({
      ...prev,
      immagini: (prev.immagini ?? []).filter((_, idx) => idx !== imageIndex),
    }));
    if (initialLoadDone.current) setHasUnsavedChanges(true);
  };

  const askIncludeImages = (count: number): Promise<boolean> => {
    setIncludeImagesCount(count);
    setIsIncludeImagesModalOpen(true);
    return new Promise((resolve) => {
      includeImagesResolverRef.current = resolve;
    });
  };

  const resolveIncludeImages = (include: boolean) => {
    setIsIncludeImagesModalOpen(false);
    includeImagesResolverRef.current?.(include);
    includeImagesResolverRef.current = null;
  };

  const handlePrintPdf = async () => {
    if (!patient) return;

    const currentVisit: Visit = {
      id: existingVisit?.id || "",
      patientId: patient.id,
      dataVisita: visitData.dataVisita,
      descrizioneClinica: visitData.descrizioneClinica,
      anamnesi: visitData.anamnesi,
      esamiObiettivo: visitData.esamiObiettivo,
      conclusioniDiagnostiche: visitData.conclusioniDiagnostiche,
      terapie: visitData.terapie,
      tipo: visitData.tipo as any,
      pediatria: pediatriaData,
      createdAt: existingVisit?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const imageCount = currentVisit.pediatria?.immagini?.length ?? 0;
    let includeImages = false;
    if (imageCount > 0) {
      includeImages = await askIncludeImages(imageCount);
    }

    setPdfLoading(true);
    try {
      const blob = await (PdfService as any).generatePediatricPDF?.(
        patient,
        currentVisit,
        { includeImages },
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
          <Tab key="bilancio_salute" title="Bilancio di Salute" />
          <Tab key="patologia" title="Visita per Patologia" />
          <Tab key="controllo" title="Visita di Controllo" />
        </Tabs>

        {/* Form Unificato per tutte le visite pediatriche */}
        <div className="flex flex-col lg:flex-row gap-6 mt-6">
          {/* LEFT COLUMN: Parametri e Nutrizione */}
          <div className="w-full lg:w-[32%] min-w-[300px] space-y-6">
            <Card className="shadow-sm border border-default-200 bg-white">
              <CardHeader className="pb-0 pt-4 px-4 font-semibold text-gray-700 uppercase text-xs tracking-wider">
                {visitData.tipo === "bilancio_salute"
                  ? "Parametri Auxologici & Vitali"
                  : "Parametri Vitali"}
              </CardHeader>
              <CardBody className="px-4 py-4 space-y-4">
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
                    step="0.01"
                    className={
                      visitData.tipo !== "bilancio_salute" ? "col-span-2" : ""
                    }
                  />
                  {visitData.tipo === "bilancio_salute" && (
                    <Input
                      type="text"
                      label="Percentile Peso"
                      value={pediatriaData.percentilePeso}
                      onValueChange={(v) =>
                        handlePediatriaChange("percentilePeso", v)
                      }
                      variant="bordered"
                      size="sm"
                      labelPlacement="outside"
                      placeholder="es. 50°"
                    />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
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
                    step="0.1"
                    className={
                      visitData.tipo !== "bilancio_salute" ? "col-span-2" : ""
                    }
                  />
                  {visitData.tipo === "bilancio_salute" && (
                    <Input
                      type="text"
                      label="Percentile Altezza"
                      value={pediatriaData.percentileAltezza}
                      onValueChange={(v) =>
                        handlePediatriaChange("percentileAltezza", v)
                      }
                      variant="bordered"
                      size="sm"
                      labelPlacement="outside"
                    />
                  )}
                </div>
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
                    />
                  </div>
                )}
                <Divider />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    type="text"
                    label="Temperatura (°C)"
                    value={pediatriaData.temperatura}
                    onValueChange={(v) =>
                      handlePediatriaChange("temperatura", v)
                    }
                    variant="bordered"
                    size="sm"
                    labelPlacement="outside"
                    placeholder="es. 37.5"
                  />
                  <Input
                    type="text"
                    label="SpO2 (%)"
                    value={pediatriaData.saturazioneO2}
                    onValueChange={(v) =>
                      handlePediatriaChange("saturazioneO2", v)
                    }
                    variant="bordered"
                    size="sm"
                    labelPlacement="outside"
                    placeholder="es. 98"
                  />
                </div>
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
              </CardBody>
            </Card>

            {visitData.tipo === "bilancio_salute" && (
              <Card className="shadow-sm border border-default-200 bg-white">
                <CardHeader className="pb-0 pt-4 px-4 font-semibold text-gray-700 uppercase text-xs tracking-wider">
                  Sviluppo & Nutrizione
                </CardHeader>
                <CardBody className="px-4 py-4 space-y-4">
                  <Select
                    label="Tipo Allattamento"
                    labelPlacement="outside"
                    selectedKeys={
                      pediatriaData.allattamento
                        ? [pediatriaData.allattamento]
                        : []
                    }
                    onSelectionChange={(keys) =>
                      handlePediatriaChange(
                        "allattamento",
                        String(Array.from(keys)[0] || ""),
                      )
                    }
                    variant="bordered"
                    size="sm"
                  >
                    <SelectItem key="Materno Esclusivo">
                      Materno Esclusivo
                    </SelectItem>
                    <SelectItem key="Misto">Misto</SelectItem>
                    <SelectItem key="Formula">Formula</SelectItem>
                    <SelectItem key="Non allattato">Non allattato</SelectItem>
                  </Select>

                  <Input
                    type="text"
                    label="Svezzamento"
                    value={pediatriaData.svezzamento}
                    onValueChange={(v) =>
                      handlePediatriaChange("svezzamento", v)
                    }
                    variant="bordered"
                    size="sm"
                    labelPlacement="outside"
                    placeholder="es. Iniziato / Tappe..."
                  />

                  <Textarea
                    label="Tappe Sviluppo"
                    value={pediatriaData.tappeSviluppo}
                    onValueChange={(v) =>
                      handlePediatriaChange("tappeSviluppo", v)
                    }
                    variant="bordered"
                    labelPlacement="outside"
                    minRows={2}
                    placeholder="Note sullo sviluppo psicomotorio..."
                  />
                  <Textarea
                    label="Stato Vaccinale"
                    value={pediatriaData.vaccinazioni}
                    onValueChange={(v) =>
                      handlePediatriaChange("vaccinazioni", v)
                    }
                    variant="bordered"
                    labelPlacement="outside"
                    minRows={2}
                    placeholder="es. Regolari / Da effettuare..."
                  />
                </CardBody>
              </Card>
            )}

            <Card className="shadow-sm border border-default-200 bg-white">
              <CardHeader className="pb-0 pt-4 px-4 font-semibold text-gray-700 uppercase text-xs tracking-wider">
                Files e Immagini
              </CardHeader>
              <CardBody className="px-4 py-6 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    {(pediatriaData.immagini ?? []).length}/8 immagini
                  </span>
                </div>

                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 hover:border-primary cursor-pointer text-sm">
                  <ImagePlus size={16} />
                  Carica immagini
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      handleImagesUpload(e.target.files);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>

                {(pediatriaData.immagini ?? []).length > 0 && (
                  <div className="grid grid-cols-2 gap-3">
                    {(pediatriaData.immagini ?? []).map((image, idx) => (
                      <div
                        key={`ped-eco-${idx}`}
                        className="relative group border rounded-lg overflow-hidden bg-gray-50"
                      >
                        <img
                          src={image}
                          alt={`Immagine ${idx + 1}`}
                          className="w-full h-28 object-cover cursor-zoom-in"
                          onClick={() => setFullscreenImage(image)}
                          title="Clicca per ingrandire"
                        />
                        <button
                          type="button"
                          className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleRemoveImage(idx)}
                          aria-label="Rimuovi immagine"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
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

                {/* 2. Descrizione Problema / Dati Clinici */}
                <div className="space-y-2 group">
                  <label className="text-sm font-bold text-gray-700 block mb-1">
                    2. Descrizione Problema / Dati Clinici
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

                {/* 3. Visita */}
                <div className="space-y-2 relative group">
                  <div className="flex justify-between items-end mb-1">
                    <label className="text-sm font-bold text-gray-700">
                      3. Visita
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

                {/* 4. Conclusioni e Terapie */}
                <div className="space-y-2 relative group">
                  <div className="flex justify-between items-end mb-1">
                    <label className="text-sm font-bold text-gray-700">
                      4. Conclusioni e Terapie
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

      {fullscreenImage && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-6"
          onClick={() => setFullscreenImage(null)}
        >
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="absolute top-3 right-3 z-10 rounded-full bg-white/95 border border-gray-200 text-gray-700 p-2 shadow-md hover:bg-white"
              onClick={() => setFullscreenImage(null)}
            >
              <X size={18} />
            </button>
            <img
              src={fullscreenImage}
              alt="Ingrandimento"
              className="max-w-[92vw] max-h-[92vh] object-contain rounded-2xl border border-gray-200 bg-white p-1 shadow-2xl"
            />
          </div>
        </div>
      )}

      <Modal
        isOpen={isIncludeImagesModalOpen}
        onClose={() => resolveIncludeImages(false)}
      >
        <ModalContent>
          <ModalHeader>Includere immagini?</ModalHeader>
          <ModalBody>
            <p className="text-sm text-gray-600">
              Sono presenti{" "}
              <span className="font-semibold">{includeImagesCount}</span>{" "}
              immagini nella visita. Vuoi inserirle nel PDF di stampa?
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => resolveIncludeImages(false)}>
              No
            </Button>
            <Button color="primary" onPress={() => resolveIncludeImages(true)}>
              Si, includi
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

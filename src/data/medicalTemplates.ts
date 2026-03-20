export const MedicalTemplates = {
  bilancio_salute: {
    anamnesi: [
      {
        label: "Visita pediatrica 1 Mese",
        text: "Neonato/a in buone condizioni generali. Allattamento materno esclusivo ben avviato. Calo fisiologico recuperato. Alvo e diuresi regolari."
      },
      {
        label: "Visita pediatrica 3 Mesi",
        text: "Lattante vivace e reattivo. Sorriso sociale presente. Segue gli oggetti con lo sguardo. Sospetta coliche gassose serali."
      },
      {
        label: "Visita pediatrica 6 Mesi",
        text: "Svezzamento iniziato con brodo vegetale e crema di riso. Sta seduto/a con appoggio. Lalla."
      },
      {
        label: "Visita pediatrica 12 Mesi",
        text: "Svezzamento completato, dieta libera. Deambulazione autonoma o con appoggio. Dice 2-3 parole con significato."
      }
    ],
    esameObiettivo: [
      {
        label: "Esame Obiettivo Normale",
        text: "E.O. nella norma. Cute e mucose rosee. Cavo orale: faringe non iperemica. Cuore: toni regolari, pause libere. Torace: MV presente su tutto l'ambito, non rumori patologici aggiunti. Addome: trattabile, non dolente alla palpazione. Fegato e milza nei limiti. Genitali esterni normoconformati."
      },
      {
        label: "Fimosi (Maschi)",
        text: "Genitali esterni normoconformati. Testicoli in sede scrotale. Glande non scopribile, si consiglia lieve ginnastica prepuziale senza forzare."
      }
    ],
    conclusioni: [
      {
        label: "Controllo Regolare",
        text: "Crescita staturo-ponderale adeguata. Sviluppo psicomotorio nella norma per l'età. Prossima visita pediatrica come da calendario regionale."
      }
    ]
  },
  patologia: {
    anamnesi: [
      {
        label: "Faringotonsillite",
        text: "Riferisce febbre da 2 giorni, odinofagia, non tosse."
      },
      {
        label: "Otite Media Acuta",
        text: "Riferisce otalgia, agitazione, febbricola e rinite da 3 giorni."
      },
      {
        label: "Gastroenterite",
        text: "Riferisce episodi di vomito (x3 da ieri) e scariche diarroiche (x4). Non febbre. Beve regolarmente."
      }
    ],
    esameObiettivo: [
      {
        label: "Faringe Iperemica",
        text: "Cavo orale: Faringe e tonsille marcatamente iperemiche, ipertrofiche, con presenza di essudato tonsillare. Laterocervicali palpabili e dolenti."
      },
      {
        label: "Otoscopia Patologica",
        text: "Otoscopia: Membrana timpanica destra/sinistra iperemica, estroflessa, con scomparsa del triangolo luminoso."
      },
      {
        label: "Addome Meteorico ma Trattabile",
        text: "Addome: globoso, meteorico, vivacemente peristaltico ma trattabile, non masse palpabili. Blidner negativo."
      }
    ],
    conclusioni: [
      {
        label: "Tampone Faringeo Positivo",
        text: "Eseguito tampone faringeo rapido per SBEA: POSITIVO. Prescritta terapia antibiotica."
      },
      {
        label: "Idratazione",
        text: "Si raccomanda idratazione orale frazionata. Riposo a casa. Controllo SOS per eventuale persistenza sintomatologia."
      }
    ]
  },
  controllo: {
    anamnesi: [
      {
        label: "Controllo Patologia",
        text: "Visita di controllo per rivalutazione clinica dopo disturbo intercorrente. Sintomatologia in miglioramento."
      },
      {
        label: "Follow-up Terapia",
        text: "Paziente si presenta per terminata la terapia antibiotica. Condizioni generali buone."
      }
    ],
    esameObiettivo: [
      {
        label: "Miglioramento Obiettivo",
        text: "Faringe rosea, non essudato. Timpani normointroflesi, Rosei. Obiettivita' polmonare negativa."
      }
    ],
    conclusioni: [
      {
        label: "Risoluzione",
        text: "Risolto episodio infettivo. Restitutio ad integrum."
      },
      {
        label: "Prolungamento Terapia",
        text: "Sintomatologia in parziale risoluzione, si consiglia prosieguo della terapia in atto."
      }
    ]
  },
  urgenza: {
    anamnesi: [
      {
        label: "Trauma Cranico Minore",
        text: "Riferisce caduta accidentale con trauma cranico contusivo. Ha pianto subito, non vomito, non perdita di coscienza. Nessuna amnesia."
      },
      {
        label: "Febbre Elevata",
        text: "Accesso urgente per picco febbrile > 39.5 non responsivo agli antipiretici."
      }
    ],
    esameObiettivo: [
      {
        label: "E.O. Neurologico Negativo",
        text: "Paziente vigile e reattivo. Pupille isocoriche e isocicliche, normoreagenti alla luce. Assenza di deficit neurologici a focolaio."
      }
    ],
    conclusioni: [
      {
        label: "Osservazione Domiciliare",
        text: "Parametri stabili. Spiegata alla famiglia la necessita' di osservazione domiciliare (risvegliare ogni 3h la notte). In caso di vomito a getto o sopore, raccomandato accesso in Pronto Soccorso."
      }
    ]
  },
  terapie: [
    {
      label: "Faringotonsillite SBEA",
      text: "Amoxicillina 50 mg/kg/die divisa in 2 o 3 somministrazioni per 10 giorni."
    },
    {
      label: "Otite Media Acuta (OMA)",
      text: "Amoxicillina 75-90 mg/kg/die divisa in 2 o 3 somministrazioni per 5-7 giorni. Eseguire lavaggi nasali frequenti."
    },
    {
      label: "Antipiretico (Paracetamolo)",
      text: "Paracetamolo sciroppo (10-15 mg/kg per dose) al bisogno per febbre > 38.5° o dolore."
    },
    {
      label: "Antipiretico (Ibuprofene)",
      text: "Ibuprofene sciroppo (10 mg/kg per dose) al bisogno per febbre > 38.5° o dolore."
    },
    {
      label: "Gastroenterite",
      text: "Soluzione reidratante orale a piccoli sorsi. Probiotici (es. Lactobacillus rhamnosus GG) per 5-7 giorni. Evitare dieta in bianco restrittiva."
    }
  ],
  esami_complementari: [
    { label: "Esame urine e urinocultura", text: "Esame chimico-fisico delle urine e urinocultura con antibiogramma", note: "Per sospetta IVU." },
    { label: "Tampone faringeo", text: "Tampone faringeo per SBEA", note: "Ricerca Streptococco Beta Emolitico di Gruppo A." },
    { label: "Esame feci", text: "Coprocoltura e ricerca Rotavirus/Adenovirus", note: "In corso di gastroenterite protratta." },
    { label: "Emocromo e PCR", text: "Emocromo, formula leucocitaria, PCR", note: "Per valutare infezione sistemica." }
  ],
  certificato: [
    {
      label: "Assenza da scuola (astensione)",
      text: "Il/la sottoscritto/a Dr./Dr.ssa [NOME DOTT./DOTT.SSA] certifica che il/la paziente [NOME PAZIENTE], nato/a a [LUOGO] il [DATA NASCITA], per motivi clinici necessita di ASTENSIONE dalla frequenza scolastica dal [DATA] al [DATA]. Si attesta l’idoneità alla ripresa qualora in condizioni cliniche adeguate.",
      note: "assenza astensione scuola",
    },
    {
      label: "Idoneità alla frequenza scolastica (idoneità)",
      text: "Il/la sottoscritto/a Dr./Dr.ssa [NOME DOTT./DOTT.SSA] attesta che il/la paziente [NOME PAZIENTE], in data [DATA], risulta IDONEO/A alla frequenza scolastica.",
      note: "idoneità frequenza scolastica",
    },
    {
      label: "Certificato di malattia",
      text: "Il/la sottoscritto/a Dr./Dr.ssa [NOME DOTT./DOTT.SSA] certifica che il/la paziente [NOME PAZIENTE], in data [DATA], presenta patologia in atto. Si autorizza quanto necessario per il periodo [DATA INIZIO]–[DATA FINE] secondo valutazione clinica.",
      note: "malattia",
    },
    {
      label: "Altro (testo libero)",
      text: "Si rilascia certificato per uso medico secondo valutazione clinica in data [DATA]. Descrizione: [INSERIRE TESTO].",
      note: "altro",
    },
  ],
};

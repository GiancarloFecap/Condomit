'use strict';

// Vocabulário editável: manter a grafia original, mesmo quando houver termos repetidos.
const categorias = [
  { nome: "Assembleia", prioridade: 1,
    gatilhos: ["assembleia", "pauta", "convocação", "quórum", "votação", "ata", "eleição"],
    termos: ["assembleia geral ordinária", "assembleia geral extraordinária", "AGO", "AGE", "ordem do dia", "pauta", "quórum", "primeira convocação", "segunda convocação", "edital de convocação", "lista de presença", "procuração", "procurador", "voto por procuração", "abstenção", "maioria simples", "maioria absoluta", "dois terços", "unanimidade", "ata", "aprovação de contas", "eleição de síndico", "presidente da mesa", "secretário da mesa", "assuntos gerais", "deliberação", "votação nominal", "votação por aclamação", "em discussão", "em votação", "aprovado por unanimidade", "aprovado por maioria", "rejeitado", "destituição", "mandato", "reeleição", "chapa", "candidato a síndico", "impugnação", "voto de minerva"] },
  { nome: "Cargos e órgãos", prioridade: 1,
    gatilhos: ["síndico", "conselho", "administradora", "zelador", "portaria", "gestão"],
    termos: ["síndico", "subsíndico", "síndico profissional", "conselho fiscal", "conselho consultivo", "conselheiro", "administradora", "administradora de condomínio", "zelador", "porteiro", "portaria", "gerente predial", "auxiliar de serviços gerais", "faxineira", "jardineiro", "vigilante", "advogado do condomínio", "contador", "engenheiro responsável", "comissão de obras"] },
  { nome: "Finanças", prioridade: 1,
    gatilhos: ["orçamento", "rateio", "previsão", "finanças", "balancete", "condominial", "prestação de contas", "custo", "taxa"],
    termos: ["taxa condominial", "taxa extra", "rateio", "fundo de reserva", "fundo de obras", "previsão orçamentária", "orçamento", "prestação de contas", "balancete", "cota extraordinária", "cota ordinária", "boleto", "cotação", "contrato", "aditivo contratual", "reajuste", "inadimplência", "inadimplente", "inadimplentes", "cobrança", "cobrança judicial", "protesto", "negativação", "acordo de parcelamento", "parcelamento", "saldo", "superávit", "déficit", "receita", "despesa", "folha de pagamento", "encargos trabalhistas", "seguro predial", "apólice", "IPTU", "consumo de água", "conta de luz", "conta de gás", "reais", "mil reais", "centavos"] },
  { nome: "Legislação e regras", prioridade: 2,
    gatilhos: ["regimento", "lei", "convenção", "jurídico", "multa", "locatário"],
    termos: ["convenção condominial", "regimento interno", "código civil", "lei do inquilinato", "LGPD", "lei 4.591", "multa condominial", "advertência", "notificação", "notificação extrajudicial", "fração ideal", "área comum", "área privativa", "unidade autônoma", "condômino", "condômina", "condôminos", "proprietário", "locatário", "inquilino", "morador", "imobiliária", "cartório", "registro em cartório", "quórum qualificado", "vício de convocação", "ação judicial", "juizado especial", "mediação", "direito de defesa"] },
  { nome: "Manutenção e obras", prioridade: 2,
    gatilhos: ["elevador", "manutenção", "reforma", "obra", "fachada", "encanamento", "reservatório", "infiltração"],
    termos: ["elevador", "elevadores", "manutenção preventiva", "manutenção corretiva", "contrato de manutenção", "reforma", "obra", "fachada", "pintura da fachada", "impermeabilização", "telhado", "calhas", "caixa d'água", "reservatório", "bomba d'água", "gerador", "nobreak", "portão eletrônico", "portão da garagem", "interfone", "hidrômetro", "vazamento", "infiltração", "rachadura", "laudo técnico", "laudo de vistoria", "inspeção predial", "ART", "engenheiro civil", "AVCB", "extintores", "hidrantes", "para-raios", "SPDA", "sistema de incêndio", "brigada de incêndio", "medidor", "prumada", "shaft", "encanamento", "esgoto", "caixa de gordura", "desentupimento", "limpeza de caixa d'água", "CPFL", "Sabesp", "Enel", "concessionária"] },
  { nome: "Segurança", prioridade: 2,
    gatilhos: ["segurança", "câmera", "portaria", "alarme", "acesso", "vigilância", "cftv"],
    termos: ["CFTV", "câmeras de segurança", "câmera", "central de monitoramento", "controle de acesso", "biometria", "reconhecimento facial", "cerca elétrica", "concertina", "alarme", "ronda", "portaria remota", "portaria virtual", "portaria 24 horas", "cancela", "catraca", "clausura", "empresa de segurança", "vigilância", "gravação das câmeras", "DVR", "NVR", "sensor de presença", "botão de pânico"] },
  { nome: "Áreas e serviços", prioridade: 3,
    gatilhos: ["piscina", "lazer", "salão", "churrasqueira", "garagem", "jardim", "playground", "bicicletário"],
    termos: ["piscina", "reforma da piscina", "salão de festas", "área de lazer", "churrasqueira", "playground", "academia", "brinquedoteca", "quadra poliesportiva", "sauna", "espaço gourmet", "coworking", "garagem", "vaga de garagem", "vaga de visitante", "bicicletário", "coleta seletiva", "dedetização", "desratização", "limpeza", "jardinagem", "empresa terceirizada", "lixeira", "lixo reciclável", "paisagismo", "bicicletário", "carregador de carro elétrico", "lavanderia", "depósito", "guarita"] },
  { nome: "Convivência", prioridade: 3,
    gatilhos: ["barulho", "silêncio", "moradores", "animais", "vizinho", "reclamação", "convivência"],
    termos: ["barulho", "lei do silêncio", "horário de silêncio", "mudança", "animais de estimação", "obras em unidade", "locação por temporada", "Airbnb", "reclamação", "ocorrência", "livro de ocorrências", "vizinho", "infração", "direito de vizinhança", "fumaça", "cheiro", "vazamento de unidade", "uso de áreas comuns", "reserva de espaço", "visitantes", "entregadores", "aplicativo de entrega", "encomendas"] },
  { nome: "Tecnologia e sistema", prioridade: 3,
    gatilhos: ["aplicativo", "votação eletrônica", "videoconferência", "assinatura", "sistema"],
    termos: ["aplicativo", "assembleia online", "assembleia híbrida", "videoconferência", "link da reunião", "votação eletrônica", "assinatura eletrônica", "certificado digital", "biometria facial", "QR code", "e-mail", "WhatsApp", "grupo de moradores"] },
];

module.exports = { categorias };

// Textos e percursos do tour guiado. TODO o conteúdo fica aqui: para mudar um texto, edite este
// arquivo. Cada `target` corresponde a um atributo data-tour="..." colocado no componente.
// Regras: descrever só o que existe; não mostrar dados privados; o tour nunca clica nem envia nada.
// Mudou bastante o percurso? Aumente TOUR_VERSION em logic.ts para o convite voltar a aparecer.

import type { TourDefinition, TourProfile } from './logic';

const TODOS: TourProfile[] = ['visitante', 'licitante', 'leiloeiro'];

/** Texto mostrado no convite de primeiro acesso, por perfil. */
export const INVITE_TEXT: Record<TourProfile, string> = {
  visitante: 'Primeira vez por aqui? Um tour rápido mostra a vitrine, a sala de um lote e a auditoria pública.',
  licitante: 'Conta de licitante pronta. Quer um tour rápido pela carteira, pelos lances e pelas participações?',
  leiloeiro: 'Conta de leiloeiro pronta. Quer um tour rápido pelo painel, pela criação de lotes e pelos resultados?',
};

/** Texto padrão quando o elemento da etapa não está na tela. */
export const MISSING_DEFAULT =
  'Esta parte não está na tela agora: ela depende do estado do lote, da sua conta ou ainda está carregando. Você pode seguir para a próxima etapa.';

export const TOURS: TourDefinition[] = [
  // ---------------- Tours gerais (só o cabeçalho; funcionam em qualquer página) ----------------
  {
    id: 'geral-visitante',
    profiles: ['visitante'],
    steps: [
      {
        title: 'Bem-vindo à Casa de Leilões',
        body: 'Leilões de arte simulados, em tempo real. Nenhum valor é real e as obras vêm do acervo aberto (CC0) do Cleveland Museum of Art. O tour só mostra e explica: não clica em nada nem altera dados.',
      },
      {
        target: 'nav',
        title: 'Navegação',
        body: 'A Vitrine lista os lotes ao vivo, agendados e encerrados. Sem entrar, você já pode abrir qualquer sala, acompanhar os lances e conferir a auditoria pública.',
      },
      {
        target: 'session',
        title: 'Entrar ou criar conta',
        body: 'Para participar, crie uma conta de licitante (deposita saldo simulado e dá lances) ou de leiloeiro (cria lotes e não dá lances). O papel não muda depois.',
      },
      {
        target: 'theme',
        title: 'Tema claro ou escuro',
        body: 'Alterna o tema. A escolha fica salva neste navegador.',
      },
      {
        target: 'help',
        title: 'Ajuda sempre à mão',
        body: 'Em "Como usar" você reabre este tour ou o tour da página em que estiver, quando quiser.',
      },
    ],
    nextArea: {
      label: 'Continuar com o tour desta página',
      kind: 'pagina-atual',
    },
  },
  {
    id: 'geral-licitante',
    profiles: ['licitante'],
    steps: [
      {
        title: 'Você é licitante',
        body: 'Você deposita saldo simulado, dá lances nas salas ao vivo e acompanha seus resultados. O tour só explica: não deposita, não dá lances e não altera nada.',
      },
      {
        target: 'nav-carteira',
        title: 'Carteira',
        body: 'Mostra o total, o valor reservado nos lotes que você lidera e o disponível para novos lances. É onde você faz depósitos simulados.',
      },
      {
        target: 'nav',
        title: 'Vitrine e salas',
        body: 'Escolha um lote ao vivo na Vitrine e abra a sala para dar lances. O valor mínimo e o seu disponível aparecem junto do formulário.',
      },
      {
        target: 'nav-participacoes',
        title: 'Participações',
        body: 'Todos os lotes em que você ofertou: sua posição, se está ganhando ou foi superado e, nos arremates, o comprovante.',
      },
      {
        target: 'session',
        title: 'Seu pseudônimo',
        body: 'Nas salas, no histórico e nos comprovantes as outras pessoas veem só este pseudônimo. Seu email e seu saldo nunca são públicos.',
      },
      {
        target: 'help',
        title: 'Ajuda sempre à mão',
        body: 'Em "Como usar" você reabre este tour ou o tour da página em que estiver.',
      },
    ],
    nextArea: {
      label: 'Continuar com o tour desta página',
      kind: 'pagina-atual',
    },
  },
  {
    id: 'geral-leiloeiro',
    profiles: ['leiloeiro'],
    steps: [
      {
        title: 'Você é leiloeiro',
        body: 'Você cria lotes com obras do acervo do museu, acompanha as disputas e vê o total recebido. Leiloeiros não dão lances. O tour só explica: não cria nem cancela lotes.',
      },
      {
        target: 'nav-painel',
        title: 'Painel',
        body: 'Busca de obras, criação de lotes, a lista dos seus lotes (só os seus) e o total recebido com vendas liquidadas.',
      },
      {
        target: 'nav',
        title: 'Vitrine',
        body: 'Seus lotes aparecem na Vitrine para todos. Na sala você acompanha os lances em tempo real, como qualquer visitante.',
      },
      {
        target: 'session',
        title: 'Seu pseudônimo',
        body: 'O público vê só este pseudônimo nos lotes e comprovantes. Seu email nunca é exibido.',
      },
      {
        target: 'help',
        title: 'Ajuda sempre à mão',
        body: 'Em "Como usar" você reabre este tour ou o tour da página em que estiver.',
      },
    ],
    nextArea: {
      label: 'Continuar com o tour desta página',
      kind: 'pagina-atual',
    },
  },

  // ---------------- Vitrine ----------------
  {
    id: 'vitrine',
    page: 'vitrine',
    profiles: TODOS,
    readyTarget: 'vitrine-secao',
    steps: [
      {
        target: 'vitrine-hero',
        title: 'Vitrine',
        body: 'A página inicial reúne os lotes públicos. Os dados chegam do servidor e se atualizam sozinhos.',
      },
      {
        target: 'tempo-real',
        title: 'Conexão em tempo real',
        body: 'Indica se esta tela está recebendo atualizações ao vivo. Se a conexão cair, a página continua atualizando periodicamente e avisa aqui.',
      },
      {
        target: 'vitrine-filtro',
        title: 'Filtrar a vitrine',
        body: 'Filtre por título, autoria ou estado. O filtro fica no endereço da página, então dá para recarregar ou compartilhar o resultado.',
      },
      {
        target: 'vitrine-secao',
        title: 'Ao vivo, agendados e encerrados',
        body: 'Ao vivo: recebendo lances agora. Agendados: abrem no horário indicado. Encerrados: mostram o resultado final ou "Aguardando liquidação". Lotes cancelados não aparecem.',
      },
      {
        target: 'lot-card',
        title: 'Card do lote',
        body: 'Imagem, obra, lance atual (ou inicial), tempo restante ou horário, número de lances e o pseudônimo do leiloeiro. Clique no card para abrir a sala.',
        missingText:
          'Não há lotes na vitrine agora (ou nenhum corresponde ao filtro). Quando houver, cada card mostrará obra, lance atual e tempo restante, e abrirá a sala do lote.',
      },
    ],
    nextArea: {
      label: 'Abrir a sala do primeiro lote e continuar',
      kind: 'sala-de-lote',
    },
  },

  // ---------------- Sala do lote ----------------
  {
    id: 'sala',
    page: 'sala',
    profiles: TODOS,
    readyTarget: 'sala-painel',
    steps: [
      {
        title: 'Sala do lote',
        body: 'Aqui a disputa acontece em tempo real. O tour não pausa o leilão: lances de outras pessoas e o relógio continuam enquanto você lê.',
      },
      {
        target: 'sala-estado',
        title: 'Estado e conexão',
        body: 'O selo mostra se o lote está agendado, ao vivo ou encerrado; ao lado, se a sala está recebendo atualizações ao vivo.',
      },
      {
        target: 'sala-painel',
        title: 'Tempo e prorrogação',
        body: 'O cronômetro segue o relógio do servidor. Lances valem do início (inclusive) até o fim (exclusive). Um lance aceito com 2 minutos ou menos restantes leva o fim para 2 minutos depois dele, para evitar lance de último segundo.',
      },
      {
        target: 'sala-valores',
        title: 'Valores',
        body: 'Lance atual, próximo lance mínimo (atual + incremento, ou o lance inicial se ainda não houver lances), incremento mínimo e o pseudônimo de quem lidera.',
        optional: true,
      },
      {
        target: 'sala-resultado',
        title: 'Resultado',
        body: 'Lote encerrado e liquidado pelo servidor: valor final e pseudônimo de quem arrematou, ou "Sem lances".',
        optional: true,
      },
      {
        target: 'minha-situacao',
        title: 'Sua situação',
        body: '"Você está ganhando" ou "Você foi superado", sua posição pelo melhor lance de cada participante e seu saldo disponível e reservado. Liderar ainda não é vitória: vale quem estiver na frente no fim.',
        profiles: ['licitante'],
        optional: true,
      },
      {
        target: 'bid-form',
        title: 'Dar lance',
        body: 'O campo começa no mínimo atual. Ao enviar, o valor fica reservado enquanto você lidera e volta ao disponível se alguém cobrir. Recusas comuns: abaixo do mínimo, saldo insuficiente, você já lidera (não dá para cobrir o próprio lance), fora do horário. Uma recusa não muda histórico, saldo nem horário de fim. O tour não envia lances.',
        profiles: ['licitante'],
        optional: true,
      },
      {
        target: 'login-to-bid',
        title: 'Quer participar?',
        body: 'Entre ou crie uma conta de licitante para depositar saldo simulado e dar lances. Você volta para esta sala depois de entrar.',
        profiles: ['visitante'],
        optional: true,
      },
      {
        target: 'seller-note',
        title: 'Leiloeiros acompanham',
        body: 'Contas de leiloeiro veem a disputa em tempo real, mas não dão lances (nem nos próprios lotes nem nos de outros).',
        profiles: ['leiloeiro'],
        optional: true,
      },
      {
        target: 'sala-historico',
        title: 'Histórico de lances',
        body: 'Todos os lances aceitos, do mais recente ao mais antigo, com pseudônimo, horário do servidor e valor. Lances recusados não entram no histórico.',
      },
      {
        target: 'sala-auditoria',
        title: 'Auditoria e liquidação',
        body: 'No fim do prazo o servidor liquida o lote sozinho: o vencedor paga o valor reservado e o leiloeiro recebe. Isso só acontece com a auditoria do histórico ÍNTEGRA. Pelo link "Auditoria do histórico" qualquer pessoa confere essa verificação.',
      },
    ],
  },

  // ---------------- Auditoria pública ----------------
  {
    id: 'auditoria',
    page: 'auditoria',
    profiles: TODOS,
    readyTarget: 'auditoria-estado',
    steps: [
      {
        target: 'auditoria-cabecalho',
        title: 'Auditoria pública',
        body: 'Qualquer pessoa abre esta página pelo link, sem login. "Copiar link da auditoria" copia o endereço para compartilhar.',
      },
      {
        target: 'auditoria-estado',
        title: 'Resultado da verificação',
        body: 'O servidor confere o histórico inteiro. ÍNTEGRO: tudo confere. ADULTERADO: algo não bate com as assinaturas ou com a âncora independente. VERIFICAÇÃO PENDENTE: lances recentes ainda sem confirmação. VERIFICAÇÃO INDISPONÍVEL: não deu para concluir agora. Só ÍNTEGRO é apresentado como íntegro.',
        missingText:
          'A verificação ainda está em andamento ou falhou agora. Se falhar, a página mostra o erro e "Tentar de novo"; ela nunca exibe um resultado antigo como se fosse atual.',
      },
      {
        target: 'auditoria-tabela',
        title: 'Histórico completo',
        body: 'Cada lance com pseudônimo, valor, horário e os hashes que encadeiam um lance ao anterior. Os pseudônimos são aleatórios: não revelam email nem nome.',
        optional: true,
      },
      {
        target: 'auditoria-tecnico',
        title: 'Detalhes técnicos e limites',
        body: 'Como a verificação funciona (cadeia de hashes, checkpoint assinado e âncora independente), a chave pública para conferir as assinaturas e o que a auditoria não consegue garantir.',
      },
    ],
  },

  // ---------------- Comprovante ----------------
  {
    id: 'comprovante',
    page: 'comprovante',
    profiles: TODOS,
    readyTarget: 'comprovante-valor',
    steps: [
      {
        target: 'comprovante-valor',
        title: 'Comprovante de arremate',
        body: 'Gerado pelo servidor na liquidação de um lote vendido. Valor final da compra simulada.',
        missingText: 'Este comprovante não existe ou o link está incompleto. Comprovantes só são gerados na liquidação de um lote vendido.',
      },
      {
        target: 'comprovante-dados',
        title: 'Dados do arremate',
        body: 'Identificador da transação, data da liquidação, lance vencedor e os pseudônimos do arrematante e do leiloeiro. Nenhum email ou nome real aparece aqui.',
      },
      {
        target: 'comprovante-acoes',
        title: 'Compartilhar ou imprimir',
        body: 'O link do comprovante é longo e imprevisível: só quem o recebe consegue abrir. Copie para compartilhar ou imprima.',
      },
      {
        target: 'comprovante-auditoria',
        title: 'Auditoria na liquidação',
        body: 'A liquidação só acontece com o histórico ÍNTEGRO. O link leva à auditoria pública para conferir de novo, agora.',
      },
    ],
  },

  // ---------------- Carteira (licitante) ----------------
  {
    id: 'carteira',
    page: 'carteira',
    profiles: ['licitante'],
    readyTarget: 'carteira-saldos',
    steps: [
      {
        target: 'carteira-saldos',
        title: 'Disponível, reservado e total',
        body: 'Total = disponível + reservado. Reservado é a soma dos seus lances nos lotes que você lidera agora. Disponível é o que sobra para novos lances. Os números vêm sempre do servidor.',
      },
      {
        target: 'carteira-reserva',
        title: 'Reserva e liberação',
        body: 'Ao liderar, o valor do lance sai do disponível. Se alguém cobrir, volta na hora. Se você vencer, o reservado é debitado do total na liquidação. Assim você nunca oferta mais do que tem, mesmo em vários lotes.',
      },
      {
        target: 'carteira-deposito',
        title: 'Depósito simulado',
        body: 'Sem cartão, banco ou dinheiro real; até R$ 100.000,00 por depósito. Um clique duplo ou reenvio não deposita duas vezes. O tour não preenche nem envia este formulário.',
      },
      {
        target: 'carteira-lancamentos',
        title: 'Últimos lançamentos',
        body: 'Depósitos e pagamentos de arremates. Reservas não são lançamentos: elas aparecem só no valor reservado.',
      },
    ],
  },

  // ---------------- Participações (licitante) ----------------
  {
    id: 'participacoes',
    page: 'participacoes',
    profiles: ['licitante'],
    readyTarget: 'participacoes-resumo',
    steps: [
      {
        target: 'participacoes-resumo',
        title: 'Participações e arremates',
        body: 'Todos os lotes em que você deu lance, não só as vitórias. O resumo conta lotes, lideranças e arremates.',
      },
      {
        target: 'participacoes-lista',
        title: 'Cada participação',
        body: 'Seu melhor lance, sua posição entre os participantes e a data do seu último lance. A lista se atualiza quando alguém cobre você ou o lote é liquidado.',
        missingText: 'Você ainda não deu lances. Quando der, cada lote aparece aqui com seu melhor lance, sua posição e o resultado.',
      },
      {
        target: 'participacao-resultado',
        title: 'Situação',
        body: 'Ganhando, superado, aguardando liquidação, arrematado ou não arrematado.',
        optional: true,
      },
      {
        target: 'participacao-comprovante',
        title: 'Comprovante e compartilhamento',
        body: 'Nos arremates, abra o comprovante ou copie o link para compartilhar.',
        optional: true,
      },
    ],
  },

  // ---------------- Painel do leiloeiro ----------------
  {
    id: 'painel',
    page: 'painel',
    profiles: ['leiloeiro'],
    readyTarget: 'painel-lotes',
    steps: [
      {
        target: 'painel-resumo',
        title: 'Resumo e total recebido',
        body: 'Total recebido conta só vendas já liquidadas. Ao lado, quantos lotes estão ao vivo, agendados, encerrados e cancelados.',
        missingText: 'O resumo não carregou agora. Use "Tentar de novo" se aparecer um erro.',
      },
      {
        target: 'painel-busca',
        title: 'Buscar obra no acervo',
        body: 'Busque no acervo aberto do Cleveland Museum of Art e escolha uma obra. Se a API do museu cair, o resto do painel continua funcionando; os lotes já criados guardam uma cópia dos dados da obra.',
      },
      {
        target: 'painel-novo-lote',
        title: 'Criar lote',
        body: 'Depois de escolher a obra, o formulário pede: lance inicial, incremento mínimo, início (agora ou agendado) e fim. Duração entre 2 minutos e 30 dias; horários no seu fuso, guardados em UTC. O tour não cria lotes.',
      },
      {
        target: 'painel-lotes',
        title: 'Seus lotes',
        body: 'Só os lotes criados por você, com lance atual, líder ou resultado, e links para a sala, a auditoria e o comprovante da venda.',
      },
      {
        target: 'painel-cancelar',
        title: 'Cancelar lote',
        body: 'Só aparece em lote ao vivo ou agendado sem nenhum lance, e pede confirmação. Se um lance chegar antes, o servidor recusa o cancelamento. Lote cancelado sai da vitrine e não reabre.',
        optional: true,
      },
    ],
  },

  // ---------------- Entrar / criar conta ----------------
  {
    id: 'entrar',
    page: 'entrar',
    profiles: ['visitante'],
    readyTarget: 'entrar-formulario',
    steps: [
      {
        target: 'entrar-abas',
        title: 'Entrar ou criar conta',
        body: 'Use a aba "Entrar" se já tem conta ou "Criar conta" para começar.',
      },
      {
        target: 'entrar-formulario',
        title: 'Email e senha',
        body: 'O email serve só para entrar e nunca aparece em público. A senha precisa ter pelo menos 8 caracteres. O tour não preenche nem envia este formulário.',
      },
      {
        target: 'entrar-papel',
        title: 'Escolha do papel',
        body: 'Licitante deposita saldo simulado e dá lances; leiloeiro cria lotes e não dá lances. O papel não muda depois.',
        optional: true,
      },
    ],
  },
];

/** Nome curto de cada página, usado no menu "Como usar". */
export const PAGE_LABEL: Record<NonNullable<TourDefinition['page']>, string> = {
  vitrine: 'Vitrine',
  sala: 'Sala do lote',
  auditoria: 'Auditoria',
  comprovante: 'Comprovante',
  carteira: 'Carteira',
  participacoes: 'Participações',
  painel: 'Painel',
  entrar: 'Entrar',
};

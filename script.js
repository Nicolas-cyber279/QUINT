// Controla o chat, a retomada de conversas e as preferências visuais sem acessar outros serviços.
const enderecoApi = "https://api.nicolasvaladares.pro";
const timeoutLeituraMs = 15000;
const timeoutGeracaoMs = 150000;
const elementoRaiz = document.documentElement;
const listaConversas = document.getElementById("lista-conversas");
const estadoLista = document.getElementById("estado-lista");
const areaMensagens = document.getElementById("mensagens");
const boasVindas = document.getElementById("boas-vindas");
const formularioMensagem = document.getElementById("formulario-mensagem");
const campoMensagem = document.getElementById("campo-mensagem");
const botaoEnviar = document.getElementById("botao-enviar");
const mensagemErro = document.getElementById("mensagem-erro");
const botaoTema = document.getElementById("botao-tema");
const textoTema = document.getElementById("texto-tema");
const iconeTema = document.getElementById("icone-tema");
const painelLateral = document.getElementById("painel-lateral");
const fundoMenu = document.getElementById("fundo-menu");
const botaoMenu = document.getElementById("botao-menu");
const botaoFecharMenu = document.getElementById("botao-fechar-menu");
const botaoNovaConversa = document.getElementById("botao-nova-conversa");
const marcaInicial = document.getElementById("marca-inicial");

let identificadorConversa = null;
let requisicaoEmAndamento = false;
let conversas = [];

// Aplica a preferência salva apenas no navegador, sem enviar dados de uso à API.
function aplicarTema(tema) {
  const temaClaro = tema === "claro";
  elementoRaiz.dataset.tema = temaClaro ? "claro" : "escuro";
  botaoTema.setAttribute("aria-pressed", String(temaClaro));
  textoTema.textContent = temaClaro ? "Modo escuro" : "Modo claro";
  iconeTema.textContent = temaClaro ? "☾" : "☼";
}

function mostrarErro(mensagem) {
  mensagemErro.textContent = mensagem;
  mensagemErro.hidden = false;
}

function limparErro() {
  mensagemErro.textContent = "";
  mensagemErro.hidden = true;
}

async function requisitarApi(caminho, opcoes = {}) {
  let resposta;
  try {
    resposta = await fetch(`${enderecoApi}${caminho}`, {
      ...opcoes,
      headers: {
        Accept: "application/json",
        ...(opcoes.body ? { "Content-Type": "application/json" } : {}),
        ...opcoes.headers,
      },
      signal: AbortSignal.timeout(opcoes.method === "POST" ? timeoutGeracaoMs : timeoutLeituraMs),
    });
  } catch (erro) {
    throw new Error(
      erro instanceof Error
        ? `Não foi possível conectar à API: ${erro.message}`
        : "Não foi possível conectar à API.",
    );
  }

  if (!resposta.ok) {
    throw new Error(`A API respondeu com erro HTTP ${resposta.status}.`);
  }

  try {
    return await resposta.json();
  } catch {
    throw new Error("A API retornou uma resposta que não contém JSON válido.");
  }
}

function criarMensagem(texto, tipo) {
  const linha = document.createElement("article");
  linha.className = `mensagem ${tipo === "usuario" ? "usuario" : "mensagem-assistente"}`;

  if (tipo === "assistente") {
    const avatar = document.createElement("span");
    avatar.className = "avatar-quint";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = "Q";

    const agrupamento = document.createElement("div");
    agrupamento.className = "mensagem-assistente";

    const identidade = document.createElement("div");
    identidade.className = "identidade-assistente";
    identidade.textContent = "Q.U.I.N.T.";

    const conteudo = document.createElement("div");
    conteudo.className = "conteudo-mensagem";
    conteudo.textContent = typeof texto === "string" ? texto : "A API retornou uma resposta vazia.";
    agrupamento.append(identidade, conteudo);
    linha.append(avatar, agrupamento);
  } else {
    const conteudo = document.createElement("div");
    conteudo.className = "conteudo-mensagem";
    conteudo.textContent = texto;
    linha.append(conteudo);
  }

  areaMensagens.append(linha);
  boasVindas.hidden = true;
  areaMensagens.scrollTop = areaMensagens.scrollHeight;
  return linha;
}

function definirCarregamento(ativo) {
  requisicaoEmAndamento = ativo;
  botaoEnviar.disabled = ativo;
  campoMensagem.disabled = ativo;
}

function atualizarConversaAtiva() {
  for (const [indice, botao] of [...listaConversas.querySelectorAll(".conversa-item")].entries()) {
    botao.classList.toggle("ativa", conversas[indice]?.ID === identificadorConversa);
    if (conversas[indice]?.ID === identificadorConversa) {
      botao.setAttribute("aria-current", "page");
    } else {
      botao.removeAttribute("aria-current");
    }
  }
}

async function carregarConversas() {
  estadoLista.textContent = "Carregando conversas...";
  try {
    const resultado = await requisitarApi("/QUINT/Conversas");
    if (!Array.isArray(resultado)) {
      throw new Error("A API retornou uma lista de conversas em formato inválido.");
    }
    conversas = resultado;
    listaConversas.replaceChildren();

    if (conversas.length === 0) {
      estadoLista.textContent = "Nenhuma conversa por aqui ainda.";
      listaConversas.append(estadoLista);
      return;
    }

    for (const conversa of conversas) {
      if (typeof conversa.ID !== "string" || typeof conversa["TÍTULO"] !== "string") {
        continue;
      }
      const botao = document.createElement("button");
      botao.className = "conversa-item";
      botao.type = "button";
      botao.textContent = conversa["TÍTULO"];
      botao.title = conversa["TÍTULO"];
      botao.addEventListener("click", () => retomarConversa(conversa));
      listaConversas.append(botao);
    }

    if (!listaConversas.childElementCount) {
      estadoLista.textContent = "A API não retornou conversas válidas.";
      listaConversas.append(estadoLista);
    } else {
      atualizarConversaAtiva();
    }
  } catch (erro) {
    listaConversas.replaceChildren();
    estadoLista.textContent = erro instanceof Error ? erro.message : "Não foi possível carregar as conversas.";
    listaConversas.append(estadoLista);
  }
}

function limparConversa() {
  identificadorConversa = null;
  areaMensagens.replaceChildren(boasVindas);
  boasVindas.hidden = false;
  limparErro();
  atualizarConversaAtiva();
  fecharMenu();
  campoMensagem.focus();
}

function adicionarHistorico(historico) {
  if (!Array.isArray(historico)) {
    throw new Error("A API retornou um histórico em formato inválido.");
  }
  for (const troca of historico) {
    if (typeof troca?.["USUÁRIO"] === "string") {
      criarMensagem(troca["USUÁRIO"], "usuario");
    }
    if (typeof troca?.QUINT === "string") {
      criarMensagem(troca.QUINT, "assistente");
    }
  }
}

async function retomarConversa(conversa) {
  if (requisicaoEmAndamento) return;
  definirCarregamento(true);
  limparErro();
  identificadorConversa = conversa.ID;
  areaMensagens.replaceChildren();
  boasVindas.hidden = true;
  atualizarConversaAtiva();
  fecharMenu();

  try {
    const historico = await requisitarApi(
      `/QUINT/RetomarMensagens?id=${encodeURIComponent(conversa.ID)}`,
    );
    adicionarHistorico(historico);
    if (areaMensagens.childElementCount === 0) {
      areaMensagens.append(boasVindas);
      boasVindas.hidden = false;
    }
  } catch (erro) {
    identificadorConversa = null;
    areaMensagens.replaceChildren(boasVindas);
    boasVindas.hidden = false;
    mostrarErro(erro instanceof Error ? erro.message : "Não foi possível retomar esta conversa.");
    atualizarConversaAtiva();
  } finally {
    definirCarregamento(false);
    campoMensagem.focus();
  }
}

async function enviarMensagem(texto, textoOriginal = texto) {
  limparErro();
  const mensagemUsuario = criarMensagem(texto, "usuario");

  if (texto.trim().toLocaleLowerCase("pt-BR") === "tchau" && identificadorConversa) {
    criarMensagem("Conversa encerrada. Você pode iniciar outra quando quiser.", "assistente");
    identificadorConversa = null;
    atualizarConversaAtiva();
    return;
  }

  definirCarregamento(true);
  const indicador = document.createElement("p");
  indicador.className = "digitando";
  indicador.textContent = "Q.U.I.N.T. está pensando...";
  areaMensagens.append(indicador);
  areaMensagens.scrollTop = areaMensagens.scrollHeight;

  try {
    if (!identificadorConversa) {
      const sessao = await requisitarApi("/QUINT/IniciarSessao", {
        method: "POST",
        body: JSON.stringify({ primeiroPrompt: texto }),
      });
      if (!Array.isArray(sessao) || typeof sessao[0]?.ID !== "string" || typeof sessao[1]?.QUINT !== "string") {
        throw new Error("A API retornou dados inválidos ao iniciar a conversa.");
      }
      identificadorConversa = sessao[0].ID;
      criarMensagem(sessao[1].QUINT, "assistente");
      await carregarConversas();
    } else {
      const resposta = await requisitarApi("/QUINT/ContinuarSessao", {
        method: "POST",
        body: JSON.stringify({ id: identificadorConversa, prompt: texto }),
      });
      if (typeof resposta?.QUINT !== "string") {
        throw new Error("A API retornou dados inválidos ao continuar a conversa.");
      }
      criarMensagem(resposta.QUINT, "assistente");
    }
  } catch (erro) {
    mensagemUsuario.remove();
    campoMensagem.value = textoOriginal;
    ajustarAlturaCampo();
    mostrarErro(erro instanceof Error ? erro.message : "Não foi possível enviar sua mensagem.");
  } finally {
    indicador.remove();
    definirCarregamento(false);
    campoMensagem.focus();
  }
}

function ajustarAlturaCampo() {
  campoMensagem.style.height = "auto";
  campoMensagem.style.height = `${Math.min(campoMensagem.scrollHeight, 180)}px`;
}

// Expande a caixa de texto até um limite confortável e envia com Enter.
campoMensagem.addEventListener("input", ajustarAlturaCampo);

campoMensagem.addEventListener("keydown", (evento) => {
  if (evento.key === "Enter" && !evento.shiftKey) {
    evento.preventDefault();
    formularioMensagem.requestSubmit();
  }
});

formularioMensagem.addEventListener("submit", (evento) => {
  evento.preventDefault();
  if (requisicaoEmAndamento) return;
  const textoOriginal = campoMensagem.value;
  const texto = textoOriginal.trim();
  if (!texto) return;
  campoMensagem.value = "";
  campoMensagem.style.height = "auto";
  void enviarMensagem(texto, textoOriginal);
});

botaoNovaConversa.addEventListener("click", limparConversa);
marcaInicial.addEventListener("click", (evento) => {
  evento.preventDefault();
  limparConversa();
});

botaoTema.addEventListener("click", () => {
  const novoTema = elementoRaiz.dataset.tema === "claro" ? "escuro" : "claro";
  localStorage.setItem("tema-quint", novoTema);
  aplicarTema(novoTema);
});

function fecharMenu() {
  painelLateral.classList.remove("aberto");
  fundoMenu.classList.remove("visivel");
  botaoMenu.setAttribute("aria-expanded", "false");
}

botaoMenu.addEventListener("click", () => {
  const aberto = painelLateral.classList.toggle("aberto");
  fundoMenu.classList.toggle("visivel", aberto);
  botaoMenu.setAttribute("aria-expanded", String(aberto));
});

botaoFecharMenu.addEventListener("click", fecharMenu);
fundoMenu.addEventListener("click", fecharMenu);

aplicarTema(localStorage.getItem("tema-quint") || "escuro");
void carregarConversas();

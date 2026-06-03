// CONFIGURAÇÕES INICIAIS
// ==========================================
const BOT_TOKEN = '8662083027:AAE9xsTnQwk-WX9gbXWyPQngdiGomnTnSBk';       
const CHAT_ID = '-1002092995685';               
const CHAT_ID_VIDEOS = '-1002092995685'; 
const ID_ARQUIVO_DRIVE = '1WOtn54jmmCLwKBHOteJu0cKVkGCJgmBu';    
const EXT_SPREADSHEET_ID = '1GPajSCp1TkJDEDOGZIrXxgZuNuRs7545buFntyDlpL8';
const EXT_REGISTRO_COMENTARIOS_ID = '1wNbtP78MrtrOc2Jb1ejXcHVjqndR2Vm4-3EIVqa8aOg';
const EXT_JOGADORES_ID = '1zMqnIntj5vAlU4_V_s0xf5suPTtFcl61W9DC9j8LFfM';

function doPost(e) {
  try {
    const update = JSON.parse(e.postData.contents);
    const idChatAtual = String(update.message ? update.message.chat.id : (update.callback_query ? update.callback_query.message.chat.id : ''));
    const dadosCallback = update.callback_query ? update.callback_query.data : '';
    
    // ROTA 1: VÍDEOS
    if (idChatAtual === CHAT_ID_VIDEOS || dadosCallback.startsWith("v1_") || dadosCallback.startsWith("v2_") || dadosCallback.startsWith("v3_") || dadosCallback.startsWith("v4_") || dadosCallback.startsWith("v_start_") || dadosCallback === "v_cancelar" || dadosCallback.startsWith("v_like_")) {
      
      if (update.message && update.message.forum_topic_created) {
        const nomeTopico = update.message.forum_topic_created.name;
        const idTopico = String(update.message.message_id); 
        const idCriador = String(update.message.from ? update.message.from.id : '');
        
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const sheetVideos = ss.getSheetByName("Vídeos") || ss.getSheetByName("Videos");
        if (sheetVideos) sheetVideos.appendRow([nomeTopico, idTopico, idCriador]);
        
        iniciarFluxoVideos(idTopico, nomeTopico);
      }
      
      if (update.callback_query) processarCallbackQueryVideos(update.callback_query);

      if (update.message && update.message.text && !update.message.forum_topic_created) {
        verificarComentarioTerceiros(update.message, "Videos");
      }
      
      return HtmlService.createHtmlOutput("OK");
    }

    // ROTA 2: MÚSICAS
    if (idChatAtual === CHAT_ID || dadosCallback.startsWith("p1_") || dadosCallback.startsWith("p1b_") || dadosCallback.startsWith("p2_") || dadosCallback.startsWith("p3_") || dadosCallback.startsWith("p4_") || dadosCallback.startsWith("p5_") || dadosCallback.startsWith("sub_mus_") || dadosCallback.startsWith("valer_coment_") || dadosCallback.startsWith("conf_") || dadosCallback.startsWith("meta_")) {
      
      if (update.message && update.message.forum_topic_created) {
        const nomeTopico = update.message.forum_topic_created.name;
        const idTopico = String(update.message.message_id); 
        const idCriador = String(update.message.from ? update.message.from.id : '');
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const abaMusicas = ss.getSheetByName("Músicas");
        if (abaMusicas) abaMusicas.appendRow([nomeTopico, idTopico, idCriador]);
        salvarCache(idCriador, idTopico, { titulo: nomeTopico });
        enviarPerguntaInicial(idTopico, nomeTopico);
      }
      if (update.callback_query) processarCallbackQuery(update.callback_query);
      if (update.message && update.message.text && !update.message.forum_topic_created) {
        const foiProcessado = processarTextoPuro(update.message);
        if (!foiProcessado) verificarComentarioMetacritic(update.message);
      }
      return HtmlService.createHtmlOutput("OK");
    }

  } catch (erro) { Logger.log(erro.message); }
  return HtmlService.createHtmlOutput("OK");
}

// ==========================================
// FLUXO DE VÍDEOS
// ==========================================
function iniciarFluxoVideos(threadId, nomeTopico) {
  const txt = `🎬 *Novo vídeo detectado:* "${nomeTopico}"\n\nDeseja registrar este vídeo nos charts?`;
  const botoes = [
    [{ text: "✅ Sim", callback_data: "v1_sim" }, { text: "❌ Não", callback_data: "v1_nao" }]
  ];
  enviarMensagemVideosTelegram(threadId, txt, { inline_keyboard: botoes });
}

function processarCallbackQueryVideos(cb) {
  const data = cb.data;
  const threadId = cb.message.message_thread_id;
  const userId = cb.from.id;
  const messageId = cb.message.message_id;

  apiTelegram("answerCallbackQuery", { callback_query_id: cb.id });

  if (data.startsWith("v_like_")) {
    const partes = data.split("_");
    const threadAlvo = partes[2];
    registrarLikeVideo(userId, threadAlvo, messageId, threadId);
    return;
  }

  const cacheKey = `v_${userId}_${threadId}`;
  let cache = obterCacheVideos(userId, threadId) || { titulo: "Vídeo Desconhecido" };

  if (!data.startsWith("v4_pag_")) deletarMensagemVideosTelegram(messageId);

  if (data === "v1_sim") {
    perguntarTipoVideoSingle(threadId);
  } else if (data === "v1_nao") {
    limparCacheVideos(userId, threadId);
  } else if (data.startsWith("v2_")) {
    cache.tipoSingle = data.replace("v2_", "");
    salvarCacheVideos(userId, threadId, cache);
    perguntarTipoVideoMusica(threadId);
  } else if (data.startsWith("v3_")) {
    cache.tipoMusica = data.replace("v3_", "");
    salvarCacheVideos(userId, threadId, cache);
    perguntarArtistaVideo(threadId, 1);
  } else if (data.startsWith("v4_pag_")) {
    const partes = data.split("_");
    const numArt = parseInt(partes[2]);
    const novaPagina = parseInt(partes[3]);
    perguntarArtistaVideo(threadId, numArt, novaPagina, messageId);
  } else if (data.startsWith("v4_")) {
    const partes = data.split("_");
    const numArt = parseInt(partes[1]);
    const escolha = partes.slice(2).join("_");
    if (escolha === "FIM") {
      perguntarSubstituirVideo(threadId);
    } else if (escolha === "OUTRO") {
      cache.aguardandoTextoArtistaVideo = numArt;
      const respostaMsg = enviarMensagemVideosTelegram(threadId, `✏️ Digite diretamente no chat o nome do *Artista ${numArt}:*`);
      if (respostaMsg && respostaMsg.ok) cache.idMensagemPromptVideo = respostaMsg.result.message_id;
      salvarCacheVideos(userId, threadId, cache);
    } else {
      cache[`artista${numArt}`] = escolha;
      salvarCacheVideos(userId, threadId, cache);
      direcionarProximoArtistaVideo(threadId, numArt, cache, userId);
    }
  } else if (data === "v_start_sim") {
    cache.substituir = "Sim";
    salvarCacheVideos(userId, threadId, cache);
    exibirListaVideosExterna(threadId);
  } else if (data === "v_start_nao") {
    cache.substituir = "Não";
    salvarCacheVideos(userId, threadId, cache);
    exibirResumoEConfirmacaoVideo(threadId, cache);
  } else if (data.startsWith("vsub_")) {
    const idx = parseInt(data.replace("vsub_", ""));
    cache.videoSubstituido = obterVideosPlanilhaExterna()[idx];
    salvarCacheVideos(userId, threadId, cache);
    exibirResumoEConfirmacaoVideo(threadId, cache);
  } else if (data === "vconf_enviar") {
    try {
      gravarRegistroFinalVideo(cache, threadId);
      limparCacheVideos(userId, threadId);
    } catch(e) {
      enviarMensagemVideosTelegram(threadId, `❌ *Erro ao gravar:* ${e.message}`);
    }
  } else if (data === "vconf_refazer") {
    const tituloPreservado = cache.titulo;
    cache = { titulo: tituloPreservado };
    salvarCacheVideos(userId, threadId, cache);
    enviarMensagemVideosTelegram(threadId, "🔄 *Preenchimento reiniciado.*");
    perguntarTipoVideoSingle(threadId);
  } else if (data === "v_cancelar") {
    limparCacheVideos(userId, threadId);
    enviarMensagemVideosTelegram(threadId, "🗑️ *Operação cancelada.*");
  }
}

function perguntarTipoVideoSingle(threadId) {
  const txt = "🎬 *Qual é o tipo de Single (Vídeo)?*";
  const opcoes = ["CLIPE OFICIAL", "LYRIC VIDEO", "LIVE", "BEHIND THE SCENES", "TEASER", "TRAILER", "PERFORMANCE", "REMIX", "INTERLUDE", "OUTRO"];
  let botoes = [];
  for (let i = 0; i < opcoes.length; i += 2) {
    let linha = [{ text: opcoes[i], callback_data: "v2_" + opcoes[i] }];
    if (opcoes[i+1]) linha.push({ text: opcoes[i+1], callback_data: "v2_" + opcoes[i+1] });
    botoes.push(linha);
  }
  enviarMensagemVideosTelegram(threadId, txt, { inline_keyboard: botoes });
}

function perguntarTipoVideoMusica(threadId) {
  const txt = "👥 *Qual é o formato do vídeo?*";
  const botoes = [
    [{ text: "👤 SOLO", callback_data: "v3_SOLO" }, { text: "🤝 PARCERIA", callback_data: "v3_PARCERIA" }],
    [{ text: "🎤 DUETO", callback_data: "v3_DUETO" }, { text: "🎸 CONJUNTO", callback_data: "v3_CONJUNTO" }]
  ];
  enviarMensagemVideosTelegram(threadId, txt, { inline_keyboard: botoes });
}

function perguntarArtistaVideo(threadId, numArtista, pagina = 0, messageId = null) {
  const txt = `👤 *Selecione o Artista ${numArtista} (Vídeo):*`;
  const listaArtistas = obterListaArtistas();
  const itensPorPagina = 10;
  const totalPaginas = Math.ceil(listaArtistas.length / itensPorPagina);
  const inicio = pagina * itensPorPagina;
  const artistasPagina = listaArtistas.slice(inicio, inicio + itensPorPagina);
  
  let botoes = [];
  for (let i = 0; i < artistasPagina.length; i += 2) {
    let linha = [{ text: artistasPagina[i], callback_data: `v4_${numArtista}_` + artistasPagina[i].substring(0,20) }];
    if (artistasPagina[i+1]) linha.push({ text: artistasPagina[i+1], callback_data: `v4_${numArtista}_` + artistasPagina[i+1].substring(0,20) });
    botoes.push(linha);
  }
  
  let linhaPaginacao = [];
  if (pagina > 0) linhaPaginacao.push({ text: "⬅️ Anterior", callback_data: `v4_pag_${numArtista}_${pagina - 1}` });
  if (pagina < totalPaginas - 1) linhaPaginacao.push({ text: "Próxima ➡️", callback_data: `v4_pag_${numArtista}_${pagina + 1}` });
  if (linhaPaginacao.length > 0) botoes.push(linhaPaginacao);
  
  let linhaExtra = [{ text: "✏️ Outro (Digitar)", callback_data: `v4_${numArtista}_OUTRO` }];
  if (numArtista > 2) linhaExtra.unshift({ text: "⏭️ Finalizar Artistas", callback_data: `v4_${numArtista}_FIM` });
  botoes.push(linhaExtra);
  
  if (messageId) {
    apiTelegram("editMessageReplyMarkup", { chat_id: CHAT_ID, message_id: messageId, reply_markup: { inline_keyboard: botoes } });
  } else {
    enviarMensagemVideosTelegram(threadId, txt, { inline_keyboard: botoes });
  }
}

function perguntarSubstituirVideo(threadId) {
  const txt = "🔄 *Substituir algum vídeo existente nos charts?*";
  const botoes = [[{ text: "✅ Sim", callback_data: "v_start_sim" }, { text: "❌ Não", callback_data: "v_start_nao" }]];
  enviarMensagemVideosTelegram(threadId, txt, { inline_keyboard: botoes });
}

function exibirListaVideosExterna(threadId) {
  const txt = "🎬 *Selecione o vídeo a substituir:*";
  const videos = obterVideosPlanilhaExterna();
  let botoes = [];
  for (let i = 0; i < Math.min(videos.length, 15); i++) {
    botoes.push([{ text: videos[i], callback_data: `vsub_${i}` }]);
  }
  if (botoes.length === 0) botoes.push([{ text: "Nenhum vídeo encontrado", callback_data: "v_cancelar" }]);
  enviarMensagemVideosTelegram(threadId, txt, { inline_keyboard: botoes });
}

function exibirResumoEConfirmacaoVideo(threadId, cache) {
  let resumo = `📝 *Resumo do Vídeo:*\n\n• Título: ${cache.titulo}\n• Tipo: ${cache.tipoSingle || "-"}\n• Formato: ${cache.tipoMusica || "-"}\n• Substituir: ${cache.substituir || "Não"}\n`;
  if (cache.videoSubstituido) resumo += `• Vídeo Alvo: ${cache.videoSubstituido}\n`;
  resumo += `\n👥 *Artistas:* \n`;
  for(let i=1; i<=5; i++) { if (cache[`artista${i}`]) resumo += ` - Artista ${i}: ${cache[`artista${i}`]}\n`; }
  
  const botoes = [
    [{ text: "🚀 Enviar para os Charts", callback_data: "vconf_enviar" }],
    [{ text: "✏️ Refazer Preenchimento", callback_data: "vconf_refazer" }],
    [{ text: "🗑️ Cancelar", callback_data: "v_cancelar" }]
  ];
  enviarMensagemVideosTelegram(threadId, resumo, { inline_keyboard: botoes });
}

function gravarRegistroFinalVideo(cache, threadId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetVideos = ss.getSheetByName("Vídeos") || ss.getSheetByName("Videos");
  
  if (sheetVideos) {
    const dados = sheetVideos.getDataRange().getValues();
    for (let i = 1; i < dados.length; i++) {
      if (String(dados[i][0]) === String(cache.titulo)) {
        sheetVideos.getRange(i + 1, 4).setValue(cache.tipoSingle || "");
        sheetVideos.getRange(i + 1, 5).setValue(cache.tipoMusica || "");
        let artistas = [];
        for (let a = 1; a <= 5; a++) { if (cache[`artista${a}`]) artistas.push(cache[`artista${a}`]); }
        sheetVideos.getRange(i + 1, 6).setValue(artistas.join(", "));
        sheetVideos.getRange(i + 1, 7).setValue(cache.substituir || "Não");
        if (cache.videoSubstituido) sheetVideos.getRange(i + 1, 8).setValue(cache.videoSubstituido);
        break;
      }
    }
  }
  enviarMensagemVideosTelegram(threadId, `✅ *Vídeo "${cache.titulo}" registrado com sucesso nos charts!*`);
}

function direcionarProximoArtistaVideo(threadId, numArtAtual, cache, userId) {
  const tipo = cache.tipoMusica;
  if (tipo === "SOLO") perguntarSubstituirVideo(threadId);
  else if (tipo === "DUETO" && numArtAtual === 2) perguntarSubstituirVideo(threadId);
  else if (numArtAtual < 5) perguntarArtistaVideo(threadId, numArtAtual + 1);
  else perguntarSubstituirVideo(threadId);
}

function registrarLikeVideo(userId, threadId, messageId, threadOrigem) {
  const nomeOff = obterNomeOff(userId);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Vídeos") || ss.getSheetByName("Videos");
  if (!sheet) return;
  const dados = sheet.getDataRange().getValues();
  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][1]) === String(threadId)) {
      let likesAtuais = dados[i][8] || "";
      if (!likesAtuais.includes(nomeOff)) {
        let novaLista = likesAtuais ? likesAtuais + ", " + nomeOff : nomeOff;
        sheet.getRange(i + 1, 9).setValue(novaLista);
        enviarMensagemVideosTelegram(threadOrigem, `❤️ *${nomeOff}* curtiu este vídeo!`);
      } else {
        enviarMensagemVideosTelegram(threadOrigem, `ℹ️ *${nomeOff}*, você já curtiu este vídeo.`);
      }
      return;
    }
  }
}

// Cache dedicado para Vídeos (usa mesma aba Bot_Cache com prefixo "v_")
function obterCacheVideos(userId, threadId) {
  const chave = `v_${userId}_${threadId}`;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Bot_Cache") || ss.insertSheet("Bot_Cache");
  const lr = sheet.getLastRow(); if (lr < 2) return null;
  const dados = sheet.getRange(2, 1, lr - 1, 2).getValues();
  for (let i = 0; i < dados.length; i++) { if (dados[i][0] === chave) return JSON.parse(dados[i][1]); }
  return null;
}

function salvarCacheVideos(userId, threadId, objetoCache) {
  const chave = `v_${userId}_${threadId}`;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Bot_Cache") || ss.insertSheet("Bot_Cache");
  const lr = sheet.getLastRow();
  if (lr >= 2) {
    const dados = sheet.getRange(2, 1, lr - 1, 1).getValues();
    for (let i = 0; i < dados.length; i++) {
      if (dados[i][0] === chave) { sheet.getRange(i + 2, 2).setValue(JSON.stringify(objetoCache)); return; }
    }
  }
  sheet.appendRow([chave, JSON.stringify(objetoCache), new Date()]);
}

function limparCacheVideos(userId, threadId) {
  const chave = `v_${userId}_${threadId}`;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Bot_Cache"); if (!sheet) return;
  const lr = sheet.getLastRow(); if (lr < 2) return;
  const dados = sheet.getRange(2, 1, lr - 1, 1).getValues();
  for (let i = 0; i < dados.length; i++) { if (dados[i][0] === chave) { sheet.deleteRow(i + 2); break; } }
}

function enviarMensagemVideosTelegram(threadId, texto, teclado = null) {
  let payload = { chat_id: CHAT_ID_VIDEOS, message_thread_id: threadId, text: texto, parse_mode: "Markdown" };
  if (teclado) payload.reply_markup = teclado;
  return apiTelegram("sendMessage", payload);
}

function deletarMensagemVideosTelegram(messageId) {
  if (!messageId) return;
  apiTelegram("deleteMessage", { chat_id: CHAT_ID_VIDEOS, message_id: messageId });
}

// Verifica comentários de terceiros (não-criadores) nos tópicos de Vídeos
function verificarComentarioTerceiros(msg, contexto) {
  const threadId = msg.message_thread_id;
  const userId = msg.from.id;
  if (!threadId) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = (contexto === "Videos")
    ? (ss.getSheetByName("Vídeos") || ss.getSheetByName("Videos"))
    : ss.getSheetByName("Músicas");
  if (!sheet) return;

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]) === String(threadId)) {
      const idCriador = String(data[i][2]);
      if (idCriador === String(userId)) return; // É o criador, ignora
      // Não é criador → registrar comentário externo
      const nomeOff = obterNomeOff(userId);
      const nomeTopico = data[i][0];
      registrarComentarioExterno(nomeOff, nomeTopico);
      return;
    }
  }
}

// ==========================================
// FLUXO METACRITIC E COMENTÁRIOS DE MÚSICAS
// ==========================================
function verificarComentarioMetacritic(msg) {
  const threadId = msg.message_thread_id;
  const userId = msg.from.id;
  if (!threadId) return; 

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Músicas");
  if (!sheet) return;

  const data = sheet.getDataRange().getValues();
  let eCriadorDoTopico = false;
  let topicoRegistrado = false;

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]) === String(threadId)) {
      topicoRegistrado = true;
      if (String(data[i][2]) === String(userId)) eCriadorDoTopico = true;
      break;
    }
  }

  if (!topicoRegistrado || eCriadorDoTopico) return; 
  if (jaVotouMetacritic(userId, threadId)) return;

  const txt = "📊 *Analisando para o Metacritic, qual nota você dá?*";
  const botoes = [
    [{ text: "45 a 60", callback_data: "meta_45_60" }, { text: "61 a 75", callback_data: "meta_61_75" }],
    [{ text: "76 a 90", callback_data: "meta_76_90" }, { text: "91 a 100", callback_data: "meta_91_100" }]
  ];
  enviarMensagemTelegram(threadId, txt, { inline_keyboard: botoes });
}

function processarVotoMetacritic(data, threadId, userId, messageId) {
  try {
    deletarMensagemTelegram(messageId);
    const partes = data.split("_");
    const min = parseInt(partes[1]);
    const max = parseInt(partes[2]);
    const notaSorteada = Math.floor(Math.random() * (max - min + 1)) + min;
    
    registrarVotoMetacriticControle(userId, threadId, notaSorteada);
    const nomeOff = obterNomeOff(userId);
    const nomeTopico = registrarNotaEMediaMusicas(threadId, notaSorteada, nomeOff);
    
    if (nomeTopico) registrarComentarioExterno(nomeOff, nomeTopico);
  } catch (erro) {
    enviarMensagemTelegram(threadId, `❌ *Erro interno:* ${erro.message}`);
  }
}

function registrarNotaEMediaMusicas(threadId, nota, nomeOff) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Músicas");
  const data = sheet.getDataRange().getValues();
  
  for(let i = 1; i < data.length; i++) {
    if(String(data[i][1]) === String(threadId)) {
      let notasAtuais = data[i][5] || ""; 
      let novaEntrada = `${nomeOff}: ${nota}`;
      let novaStringNotas = notasAtuais ? notasAtuais + ", " + novaEntrada : novaEntrada;
      
      let entradas = novaStringNotas.split(", ");
      let soma = 0; let quantidade = 0;
      
      entradas.forEach(ent => {
        let partesEntrada = ent.split(": ");
        if (partesEntrada.length === 2) {
          let valorNota = parseInt(partesEntrada[1]);
          if (!isNaN(valorNota)) { soma += valorNota; quantidade++; }
        }
      });
      
      let mediaFinal = quantidade > 0 ? Math.round(soma / quantidade) : 0;
      sheet.getRange(i + 1, 6).setValue(novaStringNotas); 
      sheet.getRange(i + 1, 7).setValue(mediaFinal);       
      return data[i][0]; 
    }
  }
  return null;
}

function obterNomeOff(userId) {
  try {
    const sheet = SpreadsheetApp.openById(EXT_JOGADORES_ID).getSheetByName("Jogadores");
    const data = sheet.getRange(2, 2, sheet.getLastRow() - 1, 2).getValues(); 
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]) === String(userId)) return data[i][1];
    }
  } catch(e) { Logger.log("Erro ao buscar OFF: " + e.message); }
  return "Desconhecido (" + userId + ")";
}

function registrarComentarioExterno(nomeOff, nomeTopico) {
  try {
    const sheet = SpreadsheetApp.openById(EXT_REGISTRO_COMENTARIOS_ID).getSheetByName("REGISTRO");
    const ultimaLinhaPlanilha = sheet.getMaxRows();
    const colunaB = sheet.getRange(1, 2, ultimaLinhaPlanilha, 1).getValues();
    let primeiraLinhaVazia = 0;
    
    for (let i = 2; i < colunaB.length; i++) { 
      if (colunaB[i][0] === "") { primeiraLinhaVazia = i + 1; break; }
    }
    if (primeiraLinhaVazia === 0) primeiraLinhaVazia = ultimaLinhaPlanilha + 1;
    
    try { sheet.getRange(primeiraLinhaVazia, 2).setValue(nomeOff); } catch(e){}
    try { sheet.getRange(primeiraLinhaVazia, 3).setValue(nomeTopico); } catch(e){}
    try { sheet.getRange(primeiraLinhaVazia, 4).setValue("COMENTÁRIOS (SINGLES, VÍDEOS, MÚSICAS)"); } catch(e){}
  } catch(e) { Logger.log("Erro ao registrar no externo: " + e.message); }
}

function jaVotouMetacritic(userId, threadId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Controle_Metacritic") || ss.insertSheet("Controle_Metacritic");
  if (sheet.getLastRow() === 0) sheet.appendRow(["UserID", "ThreadID", "Nota Sorteada"]);
  const data = sheet.getDataRange().getValues();
  for(let i = 1; i < data.length; i++) {
    if(String(data[i][0]) === String(userId) && String(data[i][1]) === String(threadId)) return true;
  }
  return false;
}

function registrarVotoMetacriticControle(userId, threadId, nota) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Controle_Metacritic");
  if (sheet) sheet.appendRow([userId, threadId, nota]);
}

// ==========================================
// FLUXO DE PERGUNTAS DE MÚSICAS
// ==========================================
function enviarPerguntaInicial(threadId, nomeTopico) {
  const txt = `🎵 *Novo tópico detetado:* "${nomeTopico}"\n\nDesignar esta faixa para os charts?`;
  const teclado = { inline_keyboard: [[{ text: "✅ Sim", callback_data: "p1_sim" }, { text: "❌ Não", callback_data: "p1_nao" }]] };
  enviarMensagemTelegram(threadId, txt, teclado);
}

function perguntarTipoSingle(threadId) {
  const txt = "💿 *Qual é o tipo de Single?*";
  const opcoes = ["LEAD SINGLE", "PRÉ-ALBUM", "AVULSO", "PÓS-ALBUM", "PÓS-ALBUM REMIX", "SOUNDTRACK", "PROMOCIONAL", "TRACKLIST ALBUM", "REMIX", "PRÉ-ALBUM REMIX", "LEAD SINGLE REMIX", "INTERLUDE"];
  let botoes = [];
  for (let i = 0; i < opcoes.length; i += 2) {
    let linha = [{ text: opcoes[i], callback_data: "p2_" + opcoes[i] }];
    if (opcoes[i+1]) linha.push({ text: opcoes[i+1], callback_data: "p2_" + opcoes[i+1] });
    botoes.push(linha);
  }
  enviarMensagemTelegram(threadId, txt, { inline_keyboard: botoes });
}

function perguntarTipoMusica(threadId) {
  const txt = "👥 *Qual é o tipo de música?*";
  const botoes = [
    [{ text: "👤 SOLO", callback_data: "p3_SOLO" }, { text: "🤝 PARCERIA", callback_data: "p3_PARCERIA" }],
    [{ text: "🎤 DUETO", callback_data: "p3_DUETO" }, { text: "🎸 CONJUNTO", callback_data: "p3_CONJUNTO" }]
  ];
  enviarMensagemTelegram(threadId, txt, { inline_keyboard: botoes });
}

function perguntarArtista(threadId, numArtista, pagina = 0, messageId = null) {
  const txt = `👤 *Selecione o Artista ${numArtista}:*`;
  const listaArtistas = obterListaArtistas(); 
  const itensPorPagina = 10; 
  const totalPaginas = Math.ceil(listaArtistas.length / itensPorPagina);
  const inicio = pagina * itensPorPagina;
  const artistasPagina = listaArtistas.slice(inicio, inicio + itensPorPagina);
  
  let botoes = [];
  for (let i = 0; i < artistasPagina.length; i += 2) {
    let linha = [{ text: artistasPagina[i], callback_data: `p4_${numArtista}_` + artistasPagina[i].substring(0,20) }];
    if (artistasPagina[i+1]) linha.push({ text: artistasPagina[i+1], callback_data: `p4_${numArtista}_` + artistasPagina[i+1].substring(0,20) });
    botoes.push(linha);
  }
  
  let linhaPaginacao = [];
  if (pagina > 0) linhaPaginacao.push({ text: "⬅️ Anterior", callback_data: `p4_pag_${numArtista}_${pagina - 1}` });
  if (pagina < totalPaginas - 1) linhaPaginacao.push({ text: "Próxima ➡️", callback_data: `p4_pag_${numArtista}_${pagina + 1}` });
  if (linhaPaginacao.length > 0) botoes.push(linhaPaginacao);
  
  let linhaExtra = [{ text: "✏️ Outro (Digitar)", callback_data: `p4_${numArtista}_OUTRO` }];
  if (numArtista > 2) linhaExtra.unshift({ text: "⏭️ Finalizar Artistas", callback_data: `p4_${numArtista}_FIM` });
  botoes.push(linhaExtra);
  
  if (messageId) {
    apiTelegram("editMessageReplyMarkup", { chat_id: CHAT_ID, message_id: messageId, reply_markup: { inline_keyboard: botoes } });
  } else {
    enviarMensagemTelegram(threadId, txt, { inline_keyboard: botoes });
  }
}

function perguntarSubstituir(threadId) {
  const txt = "🔄 *Substituir alguma música existente nos charts?*";
  const botoes = [[{ text: "✅ Sim", callback_data: "p5_sim" }, { text: "❌ Não", callback_data: "p5_nao" }]];
  enviarMensagemTelegram(threadId, txt, { inline_keyboard: botoes });
}

function exibirListaMusicasExterna(threadId, prefixoCallback) {
  const txt = "🎼 *Selecione a música da lista:*";
  const musicas = obterMusicasPlanilhaExterna(); 
  let botoes = [];
  for (let i = 0; i < Math.min(musicas.length, 15); i++) {
    botoes.push([{ text: musicas[i], callback_data: `${prefixoCallback}_` + i }]);
  }
  if (botoes.length === 0) botoes.push([{ text: "Nenhuma música encontrada", callback_data: "conf_cancelar" }]);
  enviarMensagemTelegram(threadId, txt, { inline_keyboard: botoes });
}

function perguntarValerComentarios(threadId) {
  const txt = "💬 *Os comentários feitos neste tópico devem valer para alguma música?*";
  const botoes = [[{ text: "✅ Sim", callback_data: "p1b_sim" }, { text: "❌ Não", callback_data: "p1b_nao" }]];
  enviarMensagemTelegram(threadId, txt, { inline_keyboard: botoes });
}

function exibirResumoEConfirmacao(threadId, cache) {
  let resumo = `📝 *Resumo do Lançamento:*\n\n• Título: ${cache.titulo}\n• Single: ${cache.tipoSingle}\n• Formato: ${cache.tipoMusica}\n• Substituir nos Charts: ${cache.substituir}\n`;
  if (cache.musicaSubstituida) resumo += `• Música Alvo: ${cache.musicaSubstituida}\n`;
  resumo += `\n👥 *Artistas:* \n`;
  for(let i=1; i<=5; i++) { if (cache[`artista${i}`]) resumo += ` - Artista ${i}: ${cache[`artista${i}`]}\n`; }
  
  const botoes = [
    [{ text: "🚀 Enviar para os Charts", callback_data: "conf_enviar" }], 
    [{ text: "✏️ Refazer Preenchimento", callback_data: "conf_refazer" }],
    [{ text: "🗑️ Cancelar", callback_data: "conf_cancelar" }]
  ];
  enviarMensagemTelegram(threadId, resumo, { inline_keyboard: botoes });
}

// ==========================================
// GRAVAR REGISTRO FINAL — MÚSICAS
// ==========================================
function gravarRegistroFinal(cache) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Músicas");
  if (!sheet) throw new Error("Aba 'Músicas' não encontrada.");

  const dados = sheet.getDataRange().getValues();
  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][0]) === String(cache.titulo)) {
      sheet.getRange(i + 1, 4).setValue(cache.tipoSingle || "");
      sheet.getRange(i + 1, 5).setValue(cache.tipoMusica || "");
      let artistas = [];
      for (let a = 1; a <= 5; a++) { if (cache[`artista${a}`]) artistas.push(cache[`artista${a}`]); }
      sheet.getRange(i + 1, 8).setValue(artistas.join(", "));
      sheet.getRange(i + 1, 9).setValue(cache.substituir || "Não");
      if (cache.musicaSubstituida) sheet.getRange(i + 1, 10).setValue(cache.musicaSubstituida);

      // Registra também na planilha externa de charts
      try {
        const sheetExt = SpreadsheetApp.openById(EXT_SPREADSHEET_ID).getSheetByName("Charts");
        if (sheetExt) {
          let artistasStr = [];
          for (let a = 1; a <= 5; a++) { if (cache[`artista${a}`]) artistasStr.push(cache[`artista${a}`]); }
          sheetExt.appendRow([
            cache.titulo,
            cache.tipoSingle || "",
            cache.tipoMusica || "",
            artistasStr.join(", "),
            cache.substituir || "Não",
            cache.musicaSubstituida || "",
            new Date()
          ]);
        }
      } catch(e) { Logger.log("Erro ao gravar na planilha externa de charts: " + e.message); }
      return;
    }
  }
  throw new Error(`Título "${cache.titulo}" não encontrado na aba Músicas.`);
}

// ==========================================
// VINCULAR COMENTÁRIO A MÚSICA EXISTENTE
// ==========================================
function vincularComentario(musicaSelecionada, threadId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetMusicas = ss.getSheetByName("Músicas");
    if (!sheetMusicas) throw new Error("Aba 'Músicas' não encontrada.");

    const dados = sheetMusicas.getDataRange().getValues();
    let topicoOrigem = null;

    // Encontra o nome do tópico vinculado ao threadId atual
    for (let i = 1; i < dados.length; i++) {
      if (String(dados[i][1]) === String(threadId)) {
        topicoOrigem = dados[i][0];
        break;
      }
    }

    // Registra o vínculo na planilha: col K = "Comentários valem para"
    for (let i = 1; i < dados.length; i++) {
      if (String(dados[i][1]) === String(threadId)) {
        sheetMusicas.getRange(i + 1, 11).setValue(musicaSelecionada);
        break;
      }
    }

    enviarMensagemTelegram(threadId, `✅ *Comentários deste tópico vinculados a:* "${musicaSelecionada}"`);
  } catch(e) {
    enviarMensagemTelegram(threadId, `❌ *Erro ao vincular:* ${e.message}`);
  }
}

// ==========================================
// OBTER LISTAS DAS PLANILHAS EXTERNAS
// ==========================================

// Retorna lista de artistas da planilha EXT_SPREADSHEET_ID, aba "Artistas", coluna A
function obterListaArtistas() {
  try {
    const sheet = SpreadsheetApp.openById(EXT_SPREADSHEET_ID).getSheetByName("Artistas");
    if (!sheet) return [];
    const dados = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    return dados.map(r => String(r[0])).filter(v => v.trim() !== "");
  } catch(e) {
    Logger.log("Erro ao obter artistas: " + e.message);
    return [];
  }
}

// Retorna lista de músicas da planilha EXT_SPREADSHEET_ID, aba "Charts", coluna A
function obterMusicasPlanilhaExterna() {
  try {
    const sheet = SpreadsheetApp.openById(EXT_SPREADSHEET_ID).getSheetByName("Charts");
    if (!sheet) return [];
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    const dados = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    return dados.map(r => String(r[0])).filter(v => v.trim() !== "");
  } catch(e) {
    Logger.log("Erro ao obter músicas externas: " + e.message);
    return [];
  }
}

// Retorna lista de vídeos da planilha EXT_SPREADSHEET_ID, aba "Charts Vídeos", coluna A
function obterVideosPlanilhaExterna() {
  try {
    const sheet = SpreadsheetApp.openById(EXT_SPREADSHEET_ID).getSheetByName("Charts Vídeos");
    if (!sheet) return [];
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    const dados = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    return dados.map(r => String(r[0])).filter(v => v.trim() !== "");
  } catch(e) {
    Logger.log("Erro ao obter vídeos externos: " + e.message);
    return [];
  }
}

// ==========================================
// PROCESSADOR DE CALLBACK — MÚSICAS
// ==========================================
function processarCallbackQuery(cb) {
  const data = cb.data;
  const threadId = cb.message.message_thread_id;
  const userId = cb.from.id;
  const messageId = cb.message.message_id;
  
  apiTelegram("answerCallbackQuery", { callback_query_id: cb.id });
  
  if (data.startsWith("meta_")) { processarVotoMetacritic(data, threadId, userId, messageId); return; }
  if (!data.startsWith("p4_pag_")) deletarMensagemTelegram(messageId);
  
  let cache = obterCache(userId, threadId) || { titulo: "Faixa Desconhecida" };

  if (data.startsWith("p1_")) {
    if (data === "p1_sim") perguntarTipoSingle(threadId); else perguntarValerComentarios(threadId);
  } else if (data.startsWith("p1b_")) {
    if (data === "p1b_sim") exibirListaMusicasExterna(threadId, "valer_coment");
    else { limparCache(userId, threadId); }
  } else if (data.startsWith("valer_coment_")) {
    try {
      const idx = parseInt(data.replace("valer_coment_", ""));
      const musicaSelecionada = obterMusicasPlanilhaExterna()[idx];
      vincularComentario(musicaSelecionada, threadId); 
      limparCache(userId, threadId);
    } catch(e) { enviarMensagemTelegram(threadId, `❌ *Erro ao vincular comentário:* ${e.message}`); }
  } else if (data.startsWith("p2_")) {
    cache.tipoSingle = data.replace("p2_", ""); salvarCache(userId, threadId, cache); perguntarTipoMusica(threadId);
  } else if (data.startsWith("p3_")) {
    cache.tipoMusica = data.replace("p3_", ""); salvarCache(userId, threadId, cache); perguntarArtista(threadId, 1);
  } else if (data.startsWith("p4_pag_")) {
    const partes = data.split("_"); const numArt = parseInt(partes[2]); const novaPagina = parseInt(partes[3]);
    perguntarArtista(threadId, numArt, novaPagina, messageId);
  } else if (data.startsWith("p4_")) {
    const partes = data.split("_"); const numArt = parseInt(partes[1]); const escolha = partes.slice(2).join("_");
    if (escolha === "FIM") perguntarSubstituir(threadId);
    else if (escolha === "OUTRO") {
      cache.aguardandoTextoArtista = numArt;
      const respostaMsg = enviarMensagemTelegram(threadId, `✏️ Digite diretamente no chat o nome do *Artista ${numArt}:*`);
      if (respostaMsg && respostaMsg.ok) cache.idMensagemPrompt = respostaMsg.result.message_id;
      salvarCache(userId, threadId, cache);
    } else {
      cache[`artista${numArt}`] = escolha; salvarCache(userId, threadId, cache); direcionarProximoArtista(threadId, numArt, cache, userId);
    }
  } else if (data.startsWith("p5_")) {
    cache.substituir = (data === "p5_sim") ? "Sim" : "Não"; salvarCache(userId, threadId, cache);
    if (cache.substituir === "Sim") exibirListaMusicasExterna(threadId, "sub_mus"); else exibirResumoEConfirmacao(threadId, cache);
  } else if (data.startsWith("sub_mus_")) {
    const idx = parseInt(data.replace("sub_mus_", ""));
    cache.musicaSubstituida = obterMusicasPlanilhaExterna()[idx]; salvarCache(userId, threadId, cache); exibirResumoEConfirmacao(threadId, cache);
  } else if (data === "conf_enviar") {
    try { gravarRegistroFinal(cache); limparCache(userId, threadId); } 
    catch(e) { enviarMensagemTelegram(threadId, `❌ *Erro ao gravar no Registro:* ${e.message}`); }
  } else if (data === "conf_refazer") {
    const tituloPreservado = cache.titulo; cache = { titulo: tituloPreservado }; salvarCache(userId, threadId, cache);
    enviarMensagemTelegram(threadId, "🔄 *Preenchimento reiniciado.*"); perguntarTipoSingle(threadId); 
  } else if (data === "conf_cancelar") {
    limparCache(userId, threadId);
  }
}

function processarTextoPuro(msg) {
  const userId = msg.from.id; const threadId = msg.message_thread_id; let cache = obterCache(userId, threadId);
  if (cache && cache.aguardandoTextoArtista) {
    const numArt = cache.aguardandoTextoArtista; cache[`artista${numArt}`] = msg.text;
    if (cache.idMensagemPrompt) { deletarMensagemTelegram(cache.idMensagemPrompt); delete cache.idMensagemPrompt; }
    deletarMensagemTelegram(msg.message_id); delete cache.aguardandoTextoArtista; salvarCache(userId, threadId, cache);
    direcionarProximoArtista(threadId, numArt, cache, userId); return true; 
  }
  // Verifica também se é input de artista do fluxo de vídeos
  let cacheV = obterCacheVideos(userId, threadId);
  if (cacheV && cacheV.aguardandoTextoArtistaVideo) {
    const numArt = cacheV.aguardandoTextoArtistaVideo; cacheV[`artista${numArt}`] = msg.text;
    if (cacheV.idMensagemPromptVideo) { deletarMensagemVideosTelegram(cacheV.idMensagemPromptVideo); delete cacheV.idMensagemPromptVideo; }
    deletarMensagemTelegram(msg.message_id); delete cacheV.aguardandoTextoArtistaVideo; salvarCacheVideos(userId, threadId, cacheV);
    direcionarProximoArtistaVideo(threadId, numArt, cacheV, userId); return true;
  }
  return false;
}

function direcionarProximoArtista(threadId, numArtAtual, cache, userId) {
  const tipo = cache.tipoMusica;
  if (tipo === "SOLO") perguntarSubstituir(threadId);
  else if (tipo === "DUETO" && numArtAtual === 2) perguntarSubstituir(threadId);
  else if (numArtAtual < 5) perguntarArtista(threadId, numArtAtual + 1);
  else perguntarSubstituir(threadId);
}

// ==========================================
// SISTEMA DE CACHE TEMPORÁRIO E COMUNICAÇÃO HTTP
// ==========================================
function obterCache(userId, threadId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet(); const sheet = ss.getSheetByName("Bot_Cache") || ss.insertSheet("Bot_Cache");
  const lr = sheet.getLastRow(); if (lr < 2) return null;
  const dados = sheet.getRange(2, 1, lr - 1, 3).getValues(); const chave = `${userId}_${threadId}`;
  for (let i = 0; i < dados.length; i++) { if (dados[i][0] === chave) return JSON.parse(dados[i][1]); }
  return null;
}

function salvarCache(userId, threadId, objetoCache) {
  const ss = SpreadsheetApp.getActiveSpreadsheet(); const sheet = ss.getSheetByName("Bot_Cache") || ss.insertSheet("Bot_Cache");
  const lr = sheet.getLastRow(); const chave = `${userId}_${threadId}`;
  if (lr >= 2) {
    const dados = sheet.getRange(2, 1, lr - 1, 1).getValues();
    for (let i = 0; i < dados.length; i++) {
      if (dados[i][0] === chave) { sheet.getRange(i + 2, 2).setValue(JSON.stringify(objetoCache)); return; }
    }
  }
  sheet.appendRow([chave, JSON.stringify(objetoCache), new Date()]);
}

function limparCache(userId, threadId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet(); const sheet = ss.getSheetByName("Bot_Cache"); if (!sheet) return;
  const lr = sheet.getLastRow(); const chave = `${userId}_${threadId}`; if (lr < 2) return;
  const dados = sheet.getRange(2, 1, lr - 1, 1).getValues();
  for (let i = 0; i < dados.length; i++) { if (dados[i][0] === chave) { sheet.deleteRow(i + 2); break; } }
}

function enviarMensagemTelegram(threadId, texto, teclado = null) {
  let payload = { chat_id: CHAT_ID, message_thread_id: threadId, text: texto, parse_mode: "Markdown" };
  if (teclado) payload.reply_markup = teclado;
  return apiTelegram("sendMessage", payload);
}

function deletarMensagemTelegram(messageId) {
  if (!messageId) return; apiTelegram("deleteMessage", { chat_id: CHAT_ID, message_id: messageId });
}

function apiTelegram(metodo, payload) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${metodo}`;
  const options = { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true };
  const resposta = UrlFetchApp.fetch(url, options); return JSON.parse(resposta.getContentText());
}

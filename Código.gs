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
        sheetVideos.appendRow([nomeTopico, idTopico, idCriador]);
        
        iniciarFluxoVideos(idTopico, nomeTopico);
      }
      
      if (update.callback_query) processarCallbackQueryVideos(update.callback_query);

      if (update.message && update.message.text && !update.message.forum_topic_created) {
        verificarComentarioTerceiros(update.message);
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
        abaMusicas.appendRow([nomeTopico, idTopico, idCriador]);
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

// [IMPORTANTE: MANTENHA AQUI TODAS AS SUAS FUNÇÕES DE METACRITIC, CACHE, OBTERNOMEOFF, ETC.]

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
    else { deletarMensagemTelegram(messageId); limparCache(userId, threadId); }
  } else if (data.startsWith("valer_coment_")) {
    try {
      const idx = parseInt(data.replace("valer_coment_", ""));
      const musicaSelecionada = obterMusicasPlanilhaExterna()[idx];
      vincularComentario(musicaSelecionada, threadId); 
      limparCache(userId, threadId); deletarMensagemTelegram(messageId);
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
    try { gravarRegistroFinal(cache); limparCache(userId, threadId); deletarMensagemTelegram(messageId); } 
    catch(e) { enviarMensagemTelegram(threadId, `❌ *Erro ao gravar no Registro:* ${e.message}`); }
  } else if (data === "conf_refazer") {
    const tituloPreservado = cache.titulo; cache = { titulo: tituloPreservado }; salvarCache(userId, threadId, cache);
    enviarMensagemTelegram(threadId, "🔄 *Preenchimento reiniciado.*"); perguntarTipoSingle(threadId); 
  } else if (data === "conf_cancelar") {
    deletarMensagemTelegram(messageId); limparCache(userId, threadId);
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

// ==========================================
// CONFIGURAÇÕES
// ==========================================
const URL_MINI_APP = 'https://t.me/testeempire_bot/charts'; 
const TOKEN_BOT_VIDEOS = '8662083027:AAE9xsTnQwk-WX9gbXWyPQngdiGomnTnSBk';
const ID_GRUPO_VIDEOS = '-1002092995685';
const ID_PLAN_CHARTS = '1GPajSCp1TkJDEDOGZIrXxgZuNuRs7545buFntyDlpL8';
const ID_PLAN_JOGADORES = '1zMqnIntj5vAlU4_V_s0xf5suPTtFcl61W9DC9j8LFfM';
const ID_PLAN_REGISTRO = '1wNbtP78MrtrOc2Jb1ejXcHVjqndR2Vm4-3EIVqa8aOg';

function doGet(e) {
  let template = HtmlService.createTemplateFromFile('index');
  template.threadId = e.parameter.threadId || ""; // Fallback
  template.listaMusicas = JSON.stringify(obterListaRapida("EDIÇÃO CHARTS", 2));
  template.listaAlbuns = JSON.stringify(obterListaRapida("EDIÇÃO CHARTS ÁLBUMS", 4));
  return template.evaluate().setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function obterListaRapida(nomeAba, numColuna) {
  try {
    const sheet = SpreadsheetApp.openById(ID_PLAN_CHARTS).getSheetByName(nomeAba);
    return sheet.getRange(2, numColuna, sheet.getLastRow() - 1, 1).getValues().map(r => String(r[0]).trim()).filter(String);
  } catch(e) { return []; }
}

function iniciarFluxoVideos(threadId, nomeTopico) {
  const txt = `🎬 Olá! Deseja registrar comentários para o material "${nomeTopico}"?`;
  const teclado = { inline_keyboard: [[{ text: "✅ Sim", callback_data: "v_start_sim" }, { text: "❌ Não", callback_data: "v_start_nao" }]] };
  enviarMensagemTelegramVideos(threadId, txt, teclado);
}

function processarCallbackQueryVideos(cb) {
  const data = cb.data;
  const threadId = cb.message.message_thread_id;
  const messageId = cb.message.message_id;
  const userId = cb.from.id;

  apiTelegramVideos("answerCallbackQuery", { callback_query_id: cb.id });

  if (data.startsWith("v_like_")) {
    processarCallbackLikes(data, threadId, userId, messageId);
    return;
  }

  if (data === "v_start_nao") { deletarMensagemTelegramVideos(messageId); return; }

  if (data === "v_start_sim") {
    deletarMensagemTelegramVideos(messageId); 
    // Passando o threadId na URL também como garantia
    const urlNativa = `${URL_MINI_APP}?startapp=${threadId}&threadId=${threadId}`;
    const tecladoApp = { inline_keyboard: [[ { text: "Abrir Painel", url: urlNativa } ]] };
    let res = enviarMensagemTelegramVideos(threadId, "⚙️ Toque abaixo para configurar:", tecladoApp);
    if (res && res.ok) salvarCache("appMsg", threadId, { msgId: res.result.message_id });
  }
}

function processarPayloadWebApp(payloadString) {
  try {
    const dados = JSON.parse(payloadString);
    const threadId = String(dados.threadId);
    
    if (!threadId || threadId === "undefined") return "ERRO: ID do tópico inválido.";

    let selecionados = dados.selecionados || [];
    if (dados.tipo === 'album') selecionados = selecionados.map(v => `(ALBUM) - ${v}`);

    // 1. Grava na aba Vídeos (Local e Externa)
    salvarMaterialNasAbas(threadId, selecionados, dados.tipo);

    // 2. Marca o YouTube na Planilha de PONTOS
    if (dados.youtube && selecionados.length > 0) {
      marcarLancamentoYouTube(selecionados[0]);
    }

    // 3. Limpa o cache e apaga o botão
    let cacheMsg = obterCache("appMsg", threadId);
    if (cacheMsg && cacheMsg.msgId) {
      deletarMensagemTelegramVideos(cacheMsg.msgId);
      limparCache("appMsg", threadId);
    }
    
    return "SUCESSO";
  } catch (e) { return "ERRO: " + e.message; }
}

function salvarMaterialNasAbas(threadId, materiais, tipoMaterial) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetLocal = ss.getSheetByName("Vídeos") || ss.getSheetByName("Videos");
  let nomeTopico = "Material Sem Nome";
  
  if (sheetLocal) {
    const dados = sheetLocal.getDataRange().getValues();
    for (let i = 1; i < dados.length; i++) {
      if (String(dados[i][1]) === String(threadId)) {
        sheetLocal.getRange(i + 1, 4).setValue(materiais[0] || "");
        sheetLocal.getRange(i + 1, 5).setValue(materiais[1] || "");
        sheetLocal.getRange(i + 1, 6).setValue(materiais[2] || "");
        sheetLocal.getRange(i + 1, 8).setValue(tipoMaterial.toUpperCase());
        nomeTopico = dados[i][0];
        break;
      }
    }
  }

  try {
    const sheetExt = SpreadsheetApp.openById(ID_PLAN_JOGADORES).getSheetByName("Vídeos") || SpreadsheetApp.openById(ID_PLAN_JOGADORES).getSheetByName("Videos");
    const dadosExt = sheetExt.getDataRange().getValues();
    let encontrou = false;
    for (let i = 1; i < dadosExt.length; i++) {
      if (String(dadosExt[i][1]) === String(threadId)) {
        sheetExt.getRange(i + 1, 4).setValue(materiais[0] || "");
        sheetExt.getRange(i + 1, 5).setValue(materiais[1] || "");
        sheetExt.getRange(i + 1, 6).setValue(materiais[2] || "");
        sheetExt.getRange(i + 1, 8).setValue(tipoMaterial.toUpperCase());
        encontrou = true; break;
      }
    }
    if (!encontrou) {
      sheetExt.appendRow([nomeTopico, threadId, "", materiais[0] || "", materiais[1] || "", materiais[2] || "", "", tipoMaterial.toUpperCase()]);
    }
  } catch(e) {}
}

function marcarLancamentoYouTube(nomeMusica) {
  try {
    const sheet = SpreadsheetApp.openById(ID_PLAN_REGISTRO).getSheetByName("PONTOS");
    const dados = sheet.getRange(1, 4, sheet.getLastRow(), 1).getValues(); 
    const hoje = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");
    const alvo = String(nomeMusica).replace(/&quot;/g, '"').trim().toLowerCase();

    for (let i = 0; i < dados.length; i++) {
      if (dados[i][0] && String(dados[i][0]).trim().toLowerCase() === alvo) {
        sheet.getRange(i + 1, 14).setValue(true); // Coluna N
        sheet.getRange(i + 1, 15).setValue(hoje); // Coluna O
        break;
      }
    }
  } catch(e) {}
}

function enviarMensagemTelegramVideos(threadId, texto, teclado = null) {
  let payload = { chat_id: ID_GRUPO_VIDEOS, message_thread_id: threadId, text: texto, parse_mode: "Markdown" };
  if (teclado) payload.reply_markup = teclado;
  return apiTelegramVideos("sendMessage", payload);
}
function deletarMensagemTelegramVideos(messageId) {
  apiTelegramVideos("deleteMessage", { chat_id: ID_GRUPO_VIDEOS, message_id: messageId });
}
function apiTelegramVideos(metodo, payload) {
  const url = `https://api.telegram.org/bot${TOKEN_BOT_VIDEOS}/${metodo}`;
  const options = { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true };
  const resposta = UrlFetchApp.fetch(url, options); return JSON.parse(resposta.getContentText());
}

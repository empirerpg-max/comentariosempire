// ==========================================
// ETAPA 1: IMPORTAR OS DADOS DO JSON DE VÍDEOS
// ==========================================
function etapa1_ImportarTopicosVideos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let abaAtuais = ss.getSheetByName('Atuais_Vídeos') || ss.insertSheet('Atuais_Vídeos');
  
  abaAtuais.clear();
  // Estruturando as 4 colunas na aba temporária de vídeos
  abaAtuais.getRange("A1:D1").setValues([["Nome Original", "ID do Tópico", "ID do Criador", "Status"]]).setFontWeight("bold");

  try {
    const arquivo = DriveApp.getFileById(ID_ARQUIVO_DRIVE_VIDEOS);
    const conteudo = JSON.parse(arquivo.getBlob().getDataAsString());
    const mensagens = conteudo.messages || [];
    const listaTopicos = [];

    mensagens.forEach(msg => {
      if (msg.type === 'service' && msg.action === 'topic_created') {
        const criadorId = msg.actor_id ? msg.actor_id.replace('user', '') : '';
        listaTopicos.push([msg.title, msg.id, criadorId, ""]);
      }
    });

    if (listaTopicos.length > 0) {
      abaAtuais.getRange(2, 1, listaTopicos.length, 4).setValues(listaTopicos);
      SpreadsheetApp.flush();
      Logger.log(`✅ Sucesso! ${listaTopicos.length} tópicos de vídeos importados para a aba "Atuais_Vídeos".`);
    } else {
      Logger.log('❌ Nenhum tópico detectado no JSON de vídeos.');
    }
  } catch (erro) {
    Logger.log(`❌ Erro na importação: ${erro.message}`);
  }
}

// ==========================================
// ETAPA 2: ALTERAR NO TELEGRAM E SALVAR NA ABA VÍDEOS
// ==========================================
function etapa2_ProcessarEAtualizarVideos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const abaAtuais = ss.getSheetByName("Atuais_Vídeos");
  let abaVideos = ss.getSheetByName("Vídeos") || ss.insertSheet("Vídeos");

  const ultimaLinha = abaAtuais.getLastRow();
  if (ultimaLinha < 2) {
    Logger.log("⚠ A aba 'Atuais_Vídeos' está vazia.");
    return;
  }

  if (abaVideos.getLastRow() === 0) {
    abaVideos.getRange("A1:C1").setValues([["Novo Nome", "ID do Tópico", "ID do Criador"]]).setFontWeight("bold");
  }

  // Controle de tempo seguro contra o timeout do Google (5.5 minutos)
  const tempoInicio = Date.now();
  const limiteTempo = 5.5 * 60 * 1000; 

  const dados = abaAtuais.getRange(2, 1, ultimaLinha - 1, 4).getValues();
  let processadosNestaRodada = 0;

  for (let i = 0; i < dados.length; i++) {
    if (Date.now() - tempoInicio > limiteTempo) {
      Logger.log("⏳ Limite de tempo próximo! O script pausou. Rode a função novamente para continuar de onde parou.");
      return; 
    }

    const nomeOriginal = dados[i][0];
    const topicoId = dados[i][1];
    const criadorId = dados[i][2];
    const status = dados[i][3]; 

    if (status === "Concluído") continue;

    let nomeFinal = nomeOriginal;

    // Lógica idêntica de limpeza do caractere "|"
    if (nomeOriginal.includes('|')) {
      nomeFinal = nomeOriginal.split('|')[1].trim(); 
      
      const resultadoAPI = enviarEdicaoTelegramVideos(topicoId, nomeFinal);
      
      if (resultadoAPI.ok) {
        Logger.log(`✨ Vídeo Editado: ${nomeOriginal} -> ${nomeFinal}`);
      } else {
        Logger.log(`❌ Falha em: "${nomeOriginal}". Motivo: ${resultadoAPI.descricao}`);
        nomeFinal = nomeFinal + ` (Erro: ${resultadoAPI.descricao})`;
      }
      
      Utilities.sleep(3000); // Evita o limite de requisições do Telegram
    }

    // Salva na aba definitiva de Vídeos e marca o status
    abaVideos.appendRow([nomeFinal, topicoId, criadorId]);
    abaAtuais.getRange(i + 2, 4).setValue("Concluído");
    processadosNestaRodada++;
  }

  Logger.log(`🏆 Processamento finalizado! ${processadosNestaRodada} tópicos de vídeos alterados nesta rodada.`);
}

// ==========================================
// FUNÇÃO AUXILIAR DE ENVIO DO TELEGRAM - VÍDEOS
// ==========================================
function enviarEdicaoTelegramVideos(threadId, novoNome) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN_VIDEOS}/editForumTopic`;
  const payload = { chat_id: CHAT_ID_VIDEOS, message_thread_id: threadId, name: novoNome };
  const options = { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true };

  try {
    const reply = UrlFetchApp.fetch(url, options);
    const json = JSON.parse(reply.getContentText());
    return { ok: json.ok, descricao: json.description || "Erro" };
  } catch (e) {
    return { ok: false, description: e.message };
  }
}

// ==========================================
// ETAPA 3: CRUZAR DADOS DE VÍDEOS COM EDIÇÃO CHARTS
// ==========================================
function mapearVideosParaCharts() {
  const ssAtivo = SpreadsheetApp.getActiveSpreadsheet();
  const abaVideosAtiva = ssAtivo.getSheetByName("Vídeos") || ssAtivo.getSheetByName("Videos");
  
  if (!abaVideosAtiva) {
    Logger.log("❌ Erro: Aba 'Vídeos' não encontrada nesta planilha.");
    return;
  }
  
  const ultimaLinhaAtiva = abaVideosAtiva.getLastRow();
  if (ultimaLinhaAtiva < 2) {
    Logger.log("⚠ A aba 'Vídeos' está vazia ou contém apenas o cabeçalho.");
    return;
  }
  
  // 1. Puxa os títulos dos vídeos limpos localmente (Coluna A)
  const nomesVideosLocais = abaVideosAtiva.getRange(2, 1, ultimaLinhaAtiva - 1, 1).getValues();
  
  // 2. Abre a planilha de busca (EDIÇÃO CHARTS) e mapeia a Coluna B
  const idPlanilhaCharts = "1GPajSCp1TkJDEDOGZIrXxgZuNuRs7545buFntyDlpL8";
  let abaCharts;
  try {
    const ssCharts = SpreadsheetApp.openById(idPlanilhaCharts);
    abaCharts = ssCharts.getSheetByName("EDIÇÃO CHARTS"); // Alterado para EDIÇÃO CHARTS
  } catch(e) {
    Logger.log("❌ Erro ao acessar a planilha de CHARTS: " + e.message);
    return;
  }
  
  if (!abaCharts) {
    Logger.log("❌ Erro: Aba 'EDIÇÃO CHARTS' não foi encontrada na planilha externa.");
    return;
  }
  
  const dadosChartsB = abaCharts.getRange(2, 2, abaCharts.getLastRow() - 1, 1).getValues();
  
  // 3. Abre a planilha de destino e localiza/cria a aba Videos
  const idPlanilhaDestino = "1zMqnIntj5vAlU4_V_s0xf5suPTtFcl61W9DC9j8LFfM";
  let abaDestino;
  try {
    const ssDestino = SpreadsheetApp.openById(idPlanilhaDestino);
    abaDestino = ssDestino.getSheetByName("Vídeos") || ssDestino.getSheetByName("Videos") || ssDestino.insertSheet("Vídeos");
  } catch(e) {
    Logger.log("❌ Erro ao acessar a planilha de destino (Jogadores): " + e.message);
    return;
  }
  
  // Garante o cabeçalho na coluna D da planilha de destino caso ela esteja vazia
  if (abaDestino.getLastRow() === 0) {
    abaDestino.getRange("D1").setValue("Música Correspondente").setFontWeight("bold");
  }

  // Matriz temporária para acumular o output da Coluna D
  const resultadoColunaD = [];
  
  // 4. Lógica de busca e comparação textual (Full & Partial Match)
  for (let i = 0; i < nomesVideosLocais.length; i++) {
    const videoLocalPuro = String(nomesVideosLocais[i][0]).trim();
    const videoLocalMinusculo = videoLocalPuro.toLowerCase();
    let correspondenciaOficial = ""; 
    
    if (videoLocalMinusculo !== "") {
      for (let j = 0; j < dadosChartsB.length; j++) {
        const chartPuro = String(dadosChartsB[j][0]).trim();
        const chartMinusculo = chartPuro.toLowerCase();
        
        if (chartMinusculo === videoLocalMinusculo || 
            chartMinusculo.includes(videoLocalMinusculo) || 
            videoLocalMinusculo.includes(chartMinusculo)) {
          correspondenciaOficial = chartPuro; 
          break; 
        }
      }
    }
    resultadoColunaD.push([correspondenciaOficial]);
  }
  
  // 5. Despeja em lote na Coluna D da planilha externa
  if (resultadoColunaD.length > 0) {
    abaDestino.getRange(2, 4, resultadoColunaD.length, 1).setValues(resultadoColunaD);
    Logger.log(`🏆 Concluído! ${resultadoColunaD.length} linhas analisadas e atualizadas na coluna D da planilha externa.`);
  }
}

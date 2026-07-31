export const DEFAULT_MANUAL_HTML = `<html>
<head>
  <meta charset="utf-8" />
  <title>Manual de Diretrizes - Retorno de Rota Pau Brasil</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500;700&display=swap');
    body { 
      font-family: 'Inter', sans-serif; 
      color: #0f172a; 
      padding: 40px; 
      line-height: 1.6; 
      background: #ffffff;
      font-size: 11px;
    }
    .header-logo {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 25px;
      border-bottom: 3px solid #0f35a9;
      padding-bottom: 15px;
    }
    .logo-title {
      font-size: 26px;
      font-weight: 900;
      color: #0f35a9;
      letter-spacing: -0.03em;
      margin: 0;
      line-height: 1;
    }
    .logo-subtitle {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      color: #475569;
      font-weight: 700;
      margin-top: 4px;
    }
    .logo-tag {
      color: #f59e0b;
      font-weight: 900;
    }
    .doc-code {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      color: #64748b;
      text-align: right;
      font-weight: bold;
    }
    h1 { 
      color: #0f35a9; 
      font-size: 18px; 
      font-weight: 800;
      margin-top: 10px; 
      margin-bottom: 20px;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: -0.01em;
    }
    h2 { 
      color: #0f35a9; 
      font-size: 12px; 
      font-weight: 800;
      margin-top: 25px; 
      margin-bottom: 10px;
      border-bottom: 2px solid #0f35a9; 
      padding-bottom: 4px; 
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    h3 { 
      color: #1e293b; 
      font-size: 11px; 
      font-weight: 700;
      margin-top: 12px; 
      margin-bottom: 5px;
      text-transform: uppercase;
    }
    p { 
      font-size: 11px; 
      color: #334155;
      margin: 6px 0; 
      text-align: justify;
    }
    ul, ol { 
      font-size: 11px; 
      color: #334155;
      padding-left: 20px; 
      margin-top: 5px;
      margin-bottom: 10px;
    }
    li { 
      margin: 4px 0; 
    }
    .meta-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
    }
    .meta-table td {
      padding: 8px;
      border: 1px solid #cbd5e1;
      font-size: 11px;
    }
    .meta-label {
      font-weight: 700;
      color: #475569;
      width: 25%;
      background: #f1f5f9;
    }
    .meta-val {
      color: #0f172a;
      font-weight: 600;
    }
    
    /* RACI Table Styling */
    .raci-table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
      font-size: 9px;
    }
    .raci-table th, .raci-table td {
      border: 1px solid #cbd5e1;
      padding: 6px;
      text-align: center;
    }
    .raci-table th {
      background: #0f35a9;
      color: #ffffff;
      font-weight: bold;
      text-transform: uppercase;
      font-size: 9px;
    }
    .raci-table td.activity {
      text-align: left;
      font-weight: bold;
      color: #1e293b;
      width: 40%;
    }
    .raci-badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: bold;
      font-size: 9px;
    }
    .raci-r { background: #fee2e2; color: #991b1b; }
    .raci-a { background: #fef3c7; color: #92400e; }
    .raci-c { background: #e0f2fe; color: #075985; }
    .raci-i { background: #dcfce7; color: #166534; }
    
    /* Index Box */
    .index-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px;
      margin: 15px 0;
    }
    .index-title {
      font-weight: 850;
      color: #0f35a9;
      text-transform: uppercase;
      margin-bottom: 6px;
      font-size: 10px;
      letter-spacing: 0.05em;
    }
    .index-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px;
    }
    .index-item {
      font-weight: 600;
      color: #334155;
      font-size: 10px;
    }
    .index-item span {
      color: #0f35a9;
      font-weight: 800;
      margin-right: 5px;
    }

    /* EPI Grid Styling exactly like user's image layout */
    .epi-container {
      border: 2px solid #000000;
      margin: 15px 0;
      overflow: hidden;
      border-radius: 4px;
    }
    .epi-title-bar {
      background: #000000;
      color: #ffffff;
      text-align: center;
      font-weight: 800;
      font-size: 12px;
      padding: 6px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .epi-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      background: #ffffff;
    }
    .epi-card {
      border-right: 1px solid #000000;
      text-align: center;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 120px;
      background: #ffffff;
    }
    .epi-card:last-child {
      border-right: none;
    }
    .epi-img-placeholder {
      padding: 10px 5px;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 70px;
      background: #fafafa;
      border-bottom: 2px solid #000000;
    }
    .epi-icon-draw {
      font-size: 24px;
      font-weight: bold;
      color: #1e3a8a;
    }
    .epi-label {
      background: #ffffff;
      color: #000000;
      font-weight: 800;
      font-size: 8px;
      padding: 4px 2px;
      text-transform: uppercase;
      line-height: 1.2;
      border-top: 1px solid #000000;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 30px;
    }

    /* Flowchart PDF Styling (Visual nodes in grid) */
    .pdf-flowchart-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin: 15px 0;
    }
    .pdf-flow-box {
      background: #f59e0b;
      border: 1.5px solid #d97706;
      color: #000000;
      border-radius: 8px;
      padding: 8px;
      font-size: 9px;
      text-align: center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .pdf-flow-box-title {
      font-weight: 900;
      text-transform: uppercase;
      border-bottom: 1px solid rgba(0,0,0,0.15);
      padding-bottom: 3px;
      margin-bottom: 4px;
      font-size: 9px;
      letter-spacing: 0.02em;
    }
    .pdf-flow-box-desc {
      font-size: 8px;
      line-height: 1.2;
      font-weight: 500;
    }
    .pdf-flow-ellipse {
      background: #f59e0b;
      border: 2px solid #d97706;
      color: #000000;
      border-radius: 9999px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      text-transform: uppercase;
      font-size: 10px;
      height: 40px;
      margin: auto;
      width: 100%;
    }

    /* Platform Interface Mockups (Gestão de Vales e Produtividade) */
    .mockup-container {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      margin: 15px 0;
    }
    .mockup-card {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #ffffff;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .mockup-header {
      background: #0f35a9;
      color: #ffffff;
      padding: 6px 10px;
      font-weight: bold;
      font-size: 9px;
      text-transform: uppercase;
      display: flex;
      justify-content: space-between;
    }
    .mockup-body {
      padding: 10px;
      font-size: 9px;
      background: #f8fafc;
    }
    .mockup-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      border-bottom: 1px dashed #e2e8f0;
    }
    .mockup-row:last-child {
      border-bottom: none;
    }
    .mockup-val {
      font-weight: bold;
      color: #0f172a;
    }
    
    .rule-box {
      background: #fffbeb;
      border-left: 4px solid #f59e0b;
      padding: 10px 14px;
      margin: 12px 0;
      border-radius: 0 6px 6px 0;
    }
    .rule-box-title {
      font-weight: 700;
      font-size: 10px;
      color: #78350f;
      margin-bottom: 2px;
    }
    .footer { 
      margin-top: 35px; 
      text-align: center; 
      font-size: 8px; 
      color: #64748b; 
      border-top: 1px solid #e2e8f0; 
      padding-top: 12px; 
    }
    .page-break {
      page-break-before: always;
    }
  </style>
</head>
<body>
  <div class="header-logo">
    <div>
      <div class="logo-title">PAU BRASIL</div>
      <div class="logo-subtitle">distribuidora <span class="logo-tag">ambev</span></div>
    </div>
    <div class="doc-code">
      CÓD: POP-LOG-004-AMB<br/>
      REV: 03 (JULHO/2026)<br/>
      ÁREA: RETORNO DE ROTA & CONTROLE
    </div>
  </div>
  
  <h1>PADRÃO DE OPERAÇÃO DE RETORNO DE ROTA & CONCILIAÇÃO FISCAL</h1>
  
  <table class="meta-table">
    <tr>
      <td class="meta-label">Elaborador do Padrão</td>
      <td class="meta-val">Djeanderson Soares — Coordenador de Armazém</td>
      <td class="meta-label">Data de Elaboração</td>
      <td class="meta-val">18/07/2026</td>
    </tr>
    <tr>
      <td class="meta-label">Aprovador do Padrão</td>
      <td class="meta-val">Marcos Guilherme — GOD (Gerente de Operações)</td>
      <td class="meta-label">Status do Documento</td>
      <td class="meta-val" style="color: #10b981;">✓ Aprovado, Vigente e Auditado (DPO)</td>
    </tr>
  </table>

  <div class="index-box">
    <div class="index-title">ÍNDICE DE DIRETRIZES</div>
    <ul class="index-list">
      <li class="index-item"><span>1.</span> OBJETIVO</li>
      <li class="index-item"><span>2.</span> CAMPO DE APLICAÇÃO</li>
      <li class="index-item"><span>3.</span> SEGURANÇA (EPI OBRIGATÓRIO)</li>
      <li class="index-item"><span>4.</span> FLUXO DE DESCARREGAMENTO</li>
      <li class="index-item"><span>4.1</span> MATRIZ DE RESPONSABILIDADE (RACI DE PÁTIO)</li>
      <li class="index-item"><span>4.2</span> CONFERÊNCIA PRÉ-SAÍDA (PREVENÇÃO DE FALTAS)</li>
      <li class="index-item"><span>4.3</span> MONITORAMENTO EM ROTA (RECOLHA, COMODATO, ETA, PERNOITE)</li>
      <li class="index-item"><span>5.</span> DESCRIÇÃO DO FLUXO OPERACIONAL</li>
      <li class="index-item"><span>5.1</span> CONCILIAÇÃO FISCAL CRÍTICA (SISTEMA PROMAX)</li>
      <li class="index-item"><span>5.2</span> GESTÃO DE PRODUTIVIDADE, SLAS E EFICIÊNCIA</li>
      <li class="index-item"><span>6.</span> BLITZ DE REFUGO (CIRCULAR E SORTEADA)</li>
      <li class="index-item"><span>7.</span> ELABORADORES & APROVADORES DA OPERAÇÃO</li>
    </ul>
  </div>
  
  <h2>1. OBJETIVO</h2>
  <p>O objetivo deste padrão, é definir normas e procedimentos para o processo de gestão no processo de utilização da área de contingência. Garantindo sempre a segurança, alta produtividade com acompanhamento de KPIs, e um plano estruturado para alto volume de devolução e retorno de rotas.</p>
  
  <h2>2. CAMPO DE APLICAÇÃO</h2>
  <p>Este padrão aplica-se integralmente à área do armazém da Revenda Pau Brasil matriz e filial.</p>

  <h2>3. SEGURANÇA</h2>
  <p>Todos os procedimentos previstos neste documento devem ser respaldados pelos requisitos do Pilar Segurança do DPO. Deve-se garantir a utilização dos EPIs mínimos obrigatórios, conforme figura abaixo, exceto o capacete que deverá ser de acordo com a avaliação de risco da unidade.</p>
  
  <div class="epi-container">
    <div class="epi-title-bar">EPI - EQUIPAMENTO DE PROTEÇÃO INDIVIDUAL OBRIGATÓRIO</div>
    <div class="epi-grid">
      <div class="epi-card">
        <div class="epi-img-placeholder"><span class="epi-icon-draw">🥾</span></div>
        <div class="epi-label">BORA ANTI PERFURANTE</div>
      </div>
      <div class="epi-card">
        <div class="epi-img-placeholder"><span class="epi-icon-draw">🥽</span></div>
        <div class="epi-label">ÓCULOS CONTRA IMPACTOS</div>
      </div>
      <div class="epi-card">
        <div class="epi-img-placeholder"><span class="epi-icon-draw">🪖</span></div>
        <div class="epi-label">CAPACETE</div>
      </div>
      <div class="epi-card">
        <div class="epi-img-placeholder"><span class="epi-icon-draw">🧤</span></div>
        <div class="epi-label">LUVA PROTEÇÃO A OBJETOS CORTANTES</div>
      </div>
      <div class="epi-card">
        <div class="epi-img-placeholder"><span class="epi-icon-draw">🦺</span></div>
        <div class="epi-label">UNIFORME/COLETE REFLETIVO</div>
      </div>
    </div>
  </div>

  <div class="page-break"></div>

  <h2>4. FLUXO DE DESCARREGAMENTO</h2>
  <p>Sequenciamento lógico de atividades do processo de retorno de rota, da entrada física do veículo à sua liberação:</p>
  
  <div class="pdf-flowchart-grid">
    <div class="pdf-flow-ellipse" style="grid-column: span 1;">Início</div>
    <div class="pdf-flow-box" style="grid-column: span 1;">
      <div class="pdf-flow-box-title">GUARITA</div>
      <div class="pdf-flow-box-desc">Dá entrada no carro e informa se há devolução</div>
    </div>
    <div class="pdf-flow-box" style="grid-column: span 1;">
      <div class="pdf-flow-box-title">CONFERENTE</div>
      <div class="pdf-flow-box-desc">Confere o retorno de rota e a devolução</div>
    </div>
    <div class="pdf-flow-box" style="grid-column: span 1;">
      <div class="pdf-flow-box-title">MOTORISTA</div>
      <div class="pdf-flow-box-desc">Garante a prestação física e fiscal do veículo</div>
    </div>
    
    <div class="pdf-flow-box" style="grid-column: span 1; grid-row: 2;">
      <div class="pdf-flow-box-title">OPERADOR</div>
      <div class="pdf-flow-box-desc">Inicia o descarregamento e a organização no armazém</div>
    </div>
    <div class="pdf-flow-box" style="grid-column: span 1; grid-row: 2;">
      <div class="pdf-flow-box-title">OPERADOR</div>
      <div class="pdf-flow-box-desc">Abre as baias e verifica a integridade dos vasilhames</div>
    </div>
    <div class="pdf-flow-box" style="grid-column: span 2; grid-row: 2;">
      <div class="pdf-flow-box-title">OPERADOR (MANOBRA)</div>
      <div class="pdf-flow-box-desc">Manobra o carro após prestação de contas até a Red Zone</div>
    </div>

    <div class="pdf-flow-box" style="grid-column: span 1; grid-row: 3;">
      <div class="pdf-flow-box-title">OPERADOR</div>
      <div class="pdf-flow-box-desc">Verifica com o ajudante os carros sorteados de Blitz</div>
    </div>
    <div class="pdf-flow-box" style="grid-column: span 1; grid-row: 3;">
      <div class="pdf-flow-box-title">OPERADOR</div>
      <div class="pdf-flow-box-desc">Coloca os palets dos sorteados na área de Refugo</div>
    </div>
    <div class="pdf-flow-box" style="grid-column: span 1; grid-row: 3;">
      <div class="pdf-flow-box-title">OPERADOR (DEV)</div>
      <div class="pdf-flow-box-desc">Nos carros com devolução, descarrega até a área de segregação</div>
    </div>
    <div class="pdf-flow-ellipse" style="grid-column: span 1; grid-row: 3;">Fim</div>
  </div>

  <h2>4.1 MATRIZ DE RESPONSABILIDADE (RACI)</h2>
  <div style="background: #f8fafc; border: 1px solid #cbd5e1; padding: 10px; border-radius: 6px; margin-bottom: 12px; font-size: 9.5px; text-align: justify; color: #334155; line-height: 1.4;">
    <strong>O que é a Matriz RACI?</strong> A Matriz RACI é uma ferramenta internacional de governança que mapeia e atribui as responsabilidades operacionais sobre cada atividade de um fluxo. Ela impede duplicidade de trabalho ou falta de responsabilidade (lacunas). O acrônimo define as seguintes funções:
    <br/>• <strong>[R] Responsible (Responsável):</strong> O executor direto da tarefa ("quem faz").
    <br/>• <strong>[A] Accountable (Aprovador):</strong> O proprietário final do resultado, com poder de aprovação ou veto ("quem manda/decide").
    <br/>• <strong>[C] Consulted (Consultado):</strong> Especialistas ou profissionais que dão conselho e suporte técnico antes da execução.
    <br/>• <strong>[I] Informed (Informado):</strong> Indivíduos ou setores comunicados da conclusão do processo, sem ação direta.
  </div>

  <table class="raci-table">
    <thead>
      <tr>
        <th style="text-align: left;">Atividade / Processo</th>
        <th>Motorista</th>
        <th>Conferente</th>
        <th>Aux. Fiscal</th>
        <th>Operador</th>
        <th>Marcos G. (GOD)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="activity">Conferência Prévia de Carga (Saída)</td>
        <td><span class="raci-badge raci-r">R</span></td>
        <td><span class="raci-badge raci-c">C</span></td>
        <td><span class="raci-badge raci-i">I</span></td>
        <td>-</td>
        <td>-</td>
      </tr>
      <tr>
        <td class="activity">Entrada na Guarita & Informação de DEV</td>
        <td><span class="raci-badge raci-r">R</span></td>
        <td>-</td>
        <td><span class="raci-badge raci-r">R</span></td>
        <td>-</td>
        <td>-</td>
      </tr>
      <tr>
        <td class="activity">Conferência Física do Retorno (Cega)</td>
        <td><span class="raci-badge raci-c">C</span></td>
        <td><span class="raci-badge raci-r">R</span></td>
        <td><span class="raci-badge raci-i">I</span></td>
        <td><span class="raci-badge raci-a">A</span></td>
        <td>-</td>
      </tr>
      <tr>
        <td class="activity">Prestação de Contas Física & Fiscal</td>
        <td><span class="raci-badge raci-r">R</span></td>
        <td><span class="raci-badge raci-c">C</span></td>
        <td><span class="raci-badge raci-r">R</span></td>
        <td>-</td>
        <td>-</td>
      </tr>
      <tr>
        <td class="activity">Manobra do Veículo para Red Zone</td>
        <td><span class="raci-badge raci-i">I</span></td>
        <td>-</td>
        <td>-</td>
        <td><span class="raci-badge raci-r">R</span></td>
        <td>-</td>
      </tr>
      <tr>
        <td class="activity">Abertura de Baias & Verificação de Carga</td>
        <td><span class="raci-badge raci-i">I</span></td>
        <td>-</td>
        <td>-</td>
        <td><span class="raci-badge raci-r">R</span></td>
        <td>-</td>
      </tr>
      <tr>
        <td class="activity">Descarregamento do Veículo</td>
        <td>-</td>
        <td>-</td>
        <td>-</td>
        <td><span class="raci-badge raci-r">R</span></td>
        <td><span class="raci-badge raci-a">A</span></td>
      </tr>
      <tr>
        <td class="activity">Seleção & Separação de Pallets p/ Blitz</td>
        <td><span class="raci-badge raci-i">I</span></td>
        <td><span class="raci-badge raci-c">C</span></td>
        <td>-</td>
        <td><span class="raci-badge raci-r">R</span></td>
        <td><span class="raci-badge raci-a">A</span></td>
      </tr>
      <tr>
        <td class="activity">Lançamento de Saldo Fiscal (Promax 05.01)</td>
        <td><span class="raci-badge raci-i">I</span></td>
        <td><span class="raci-badge raci-i">I</span></td>
        <td><span class="raci-badge raci-r">R</span></td>
        <td>-</td>
        <td><span class="raci-badge raci-a">A</span></td>
      </tr>
    </tbody>
  </table>
  <p style="font-size: 8px; font-style: italic; color: #475569; margin-top: -5px;">
    * Legenda: [R] Responsável • [A] Aprovador/Autoridade • [C] Consultado • [I] Informado.
  </p>

  <div class="page-break"></div>

  <h2>4.2 CONFERÊNCIA OBRIGATÓRIA DA CARGA (PREVENÇÃO DE FALTAS)</h2>
  <div class="rule-box" style="margin-bottom: 20px;">
    <div class="rule-box-title">🛑 DIRETRIZ CRÍTICA DE EXPEDIÇÃO & ROTA (RESPONSABILIDADE DO MOTORISTA)</div>
    <p style="margin: 4px 0; color: #78350f; font-weight: bold; font-size: 10px;">
      É de total e exclusiva responsabilidade do MOTORISTA conferir 100% da carga, ativos e vasilhames fisicamente antes de assinar a liberação e sair do pátio da revenda Pau Brasil.
    </p>
    <p style="margin: 4px 0; color: #78350f; font-size: 9.5px; text-align: justify; line-height: 1.4;">
      Essa verificação rigorosa de saída visa evitar possíveis problemas de falta de produtos ou divergências físicas na entrega ao cliente final. Qualquer divergência identificada após a saída do veículo será imputada integralmente ao motorista responsável pela rota através da emissão de Vales Físicos/Eletrônicos correspondentes.
    </p>
  </div>

  <h2>4.3 MONITORAMENTO EM ROTA & ATUALIZAÇÕES DA PLATAFORMA</h2>
  <p style="text-align: justify; line-height: 1.4; margin-bottom: 12px;">
    O sistema de monitoramento de rotas comunica-se continuamente com a plataforma da Pau Brasil para prever movimentações e organizar a estrutura física do pátio com antecedência:
  </p>
  <ul style="padding-left: 15px; margin-top: 5px; margin-bottom: 15px; line-height: 1.5;">
    <li style="margin-bottom: 8px;">
      <strong>Movimentações de Rota (Recolhas e Comodatos):</strong> Quando ocorrem recolhas de ativos vazios em clientes ou entregas/devoluções de comodato de equipamentos/choppeiras, essas ações são informadas no aplicativo de entregas. O monitoramento atualiza a plataforma instantaneamente com as quantidades previstas, agilizando o encaminhamento do veículo para descarregar na Red Zone ou descarte de refugo.
    </li>
    <li style="margin-bottom: 8px;">
      <strong>Previsão de Chegada (ETA):</strong> A plataforma gerencial calcula de forma inteligente a previsão de chegada (ETA) dos veículos em trânsito com base na evolução das entregas e no tráfego das vias. Com o ETA atualizado no monitor, o Coordenador de Armazém otimiza a escala de trabalho dos conferentes para mitigar filas e agilizar as descargas.
    </li>
    <li style="margin-bottom: 8px;">
      <strong>Veículos Programados para Pernoite:</strong> Veículos cuja jornada do motorista exceda o limite ou que operem em rotas extremamente distantes e não retornem para descarregar no turno fiscal regular são sinalizados como "Pernoite". O sistema congela seu status, planejando sua recepção prioritária na abertura do turno da manhã subsequente, liberando capacidade de pátio na noite corrente.
    </li>
  </ul>

  <h2>5. DESCRIÇÃO DO FLUXO OPERACIONAL</h2>
  <p>O carro dá entrada na guarita, onde é verificado se tem devolução e o responsável no local informa. Na entrada do carro no pátio, o conferente faz a conferencia do retorno de rota, e valida a devolução e carga. Logo após o fechamento do carro e a prestação física, o operador manobra o carro para descarregamento na Red Zone. O operador verifica a organização do armazém e espaço para dá entrada na carreta ou carro e solicita motorista a colocar no local de descarregamento. Logo após, abre as baias do carro e verifica a carga e os vasilhames, para analisar se esta organizado e com fitilho, no caso de vasilhames de 600. O operador abre as baias e inicia o descarregamento, sempre avaliando o pallet antes de iniciar a manobra, e caso tenha algum palet com irregularidade o operador tem autonomia para separar esse pallet para blitz, para que seja verificado possíveis garrafas refugadas.</p>
  
  <h3>5.1 Conciliação Fiscal Crítica (Sistema Promax 05.01)</h3>
  <p>O processo de conciliação fiscal exige rigor absoluto para evitar distorções no estoque e faturamento. <strong>A Auxiliar de Armazém abre o sistema Promax na rotina 05.01 - Retorno de Rota / Reconciliação Fiscal</strong>. 
  <strong>A rotina no Promax utilizada para verificar o que se pede no fiscal (itens solicitados/faturados da carga) é a 03.03.02</strong>.
  Nesta rotina, ela vai informar todos os itens que estão no saldo fiscal, inserindo-os individualmente de forma manual. 
  <strong>Por padrão rígido de auditoria, todos os campos fiscais iniciam com quantidade ZERADA (0)</strong>. Isso obriga o preenchimento manual de cada linha com base física em documentos válidos de faturamento, prevenindo o hábito nocivo de autorização automática e assegurando 100% de precisão antes de rodar o comando de verificação da conciliação.</p>

  <h3>5.2 Gestão de Produtividade, SLAs e Eficiência</h3>
  <p>A gestão de retorno de rota da Pau Brasil baseia-se em quatro pilares de indicadores gerenciais coletados em tempo real no painel gerencial:</p>
  <ul style="padding-left: 15px; margin-top: 5px; margin-bottom: 15px;">
    <li><strong>Tempo Médio por Conferente (SLA de Descarga):</strong> O tempo padrão para descarregar e conferir um veículo é estabelecido em **menos de 30 minutos**. O painel de produtividade calcula a média móvel por conferente para corrigir gargalos operacionais e dimensionar a equipe de pátio nos picos de retorno.</li>
    <li><strong>Índice de Acerto / Acurácia de Contagem (Cega vs Promax):</strong> A meta mínima estabelecida pelo pilar DPO é de **99.2% de acurácia** de contagem física inicial na primeira passada. Desvios sistemáticos acionam reciclagem de treinamento de pátio.</li>
    <li><strong>Gargalos de Tempo de Espera (Lead Time de Pátio):</strong> Monitoramento do tempo total desde a guarita até a saída fiscal para evitar a insatisfação dos motoristas e garantir a vazão rápida da frota.</li>
  </ul>

  <div class="mockup-container">
    <div class="mockup-card">
      <div class="mockup-header">
        <span>Gestão de Vales e Descontos</span>
        <span>INTEGRADO</span>
      </div>
      <div class="mockup-body">
        <div class="mockup-row"><span>Vale ID:</span> <span class="mockup-val">#VAL-2026-8942</span></div>
        <div class="mockup-row"><span>Motorista:</span> <span class="mockup-val">Carlos Augusto Silva</span></div>
        <div class="mockup-row"><span>Falta Acusada:</span> <span class="mockup-val">12 un - Ambev 600ml Glass</span></div>
        <div class="mockup-row"><span>Ação Gerada:</span> <span class="mockup-val">Termo Assinado Eletronicamente</span></div>
      </div>
    </div>
    <div class="mockup-card">
      <div class="mockup-header" style="background: #10b981;">
        <span>Painel de Produtividade Gerencial</span>
        <span>META DPO</span>
      </div>
      <div class="mockup-body">
        <div class="mockup-row"><span>Tempo Médio Descarga:</span> <span class="mockup-val" style="color: #10b981;">24 min (Meta &lt; 30)</span></div>
        <div class="mockup-row"><span>Acurácia de Contagem:</span> <span class="mockup-val" style="color: #10b981;">99.4% (Meta &gt; 99.2)</span></div>
        <div class="mockup-row"><span>Mapas Atendidos Hoje:</span> <span class="mockup-val">14 mapas</span></div>
        <div class="mockup-row"><span>Eficiência Global:</span> <span class="mockup-val">97.8% (Excelente)</span></div>
      </div>
    </div>
  </div>

  <h2>6. BLITZ DE REFUGO (CIRCULAR E SORTEADA)</h2>
  <p>Para garantir a qualidade dos ativos de giro e evitar vasilhames trincados ou contaminados no estoque de comercialização, o sistema seleciona automaticamente <strong>2 veículos por dia</strong> para a Blitz de Refugo. 
  Esta rotina é **circular**, o que significa que o sistema garante que todos os motoristas e placas passem pela auditoria antes de reiniciar o ciclo de sorteio. 
  O veículo em Blitz deve ter 100% das caixas e engradados rebatidos fisicamente pelo conferente, registrando fotos das não-conformidades encontradas diretamente na plataforma.</p>
  
  <h2>7. ELABORADORES & APROVADORES DA OPERAÇÃO</h2>
  <p style="margin-bottom: 4px;"><strong>Djeanderson Soares</strong> — Coordenador de Armazém da Revenda Pau Brasil (Elaborador do Processo).</p>
  <p style="margin-top: 4px;"><strong>Marcos Guilherme</strong> — GOD - Gerente de Operações de Distribuição (Autoridade de Homologação).</p>
  
  <div class="footer">
    PAU BRASIL DISTRIBUIDORA AMBEV • Padrão de Operação Logística Reverso (SOP)<br/>
    Documento controlado por sistema integrado • Proibida reprodução não autorizada • DPO Ambev
  </div>
</body>
</html>`;

import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, X, Sparkles, Bot, User, CornerDownLeft } from 'lucide-react';
import { isClientFirebaseActive, getGeminiKeyFromFirestore } from '../clientFirebase';
import { GoogleGenAI } from '@google/genai';
import { ImportedRoute, AuditSession, Vale, Driver } from '../types';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
}

interface AIAgentChatProps {
  importedRoutes?: ImportedRoute[];
  audits?: AuditSession[];
  vales?: Vale[];
  drivers?: Driver[];
}

export default function AIAgentChat({
  importedRoutes = [],
  audits = [],
  vales = [],
  drivers = []
}: AIAgentChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'Olá! Sou o Assistente de Inteligência Artificial da plataforma. Posso tirar qualquer dúvida sobre a operação física de pátio, reconciliação fiscal, monitoramento de viagens ou cadastro de motoristas e veículos. Como posso te ajudar hoje?'
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(true); // Toast indicator for welcome
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setHasNewMessage(false);
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const quickQuestions = [
    "Como iniciar uma conferência?",
    "Como funciona o pernoite?",
    "O que fazer se houver sobras?",
    "Como pedir recontagem fiscal?"
  ];

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;

    const userMsgId = `user-${Date.now()}`;
    const newMessages: ChatMessage[] = [
      ...messages,
      { id: userMsgId, role: 'user', text: textToSend }
    ];
    setMessages(newMessages);
    setInputText('');
    setIsLoading(true);

    const isStaticDeployment = typeof window !== 'undefined' && (
      window.location.hostname.includes("github.io") || 
      window.location.hostname.includes("github.com") ||
      window.location.href.includes("github")
    );

    // Helper to run client-side Gemini call as fallback or primary
    const runClientSideGemini = async () => {
      console.log("[ClientFirebase] Tentando usar o Gemini diretamente no cliente...");
      let apiKey = '';
      
      try {
        const firestoreKey = await getGeminiKeyFromFirestore();
        if (firestoreKey) {
          apiKey = firestoreKey;
        }
      } catch (e) {
        console.warn("[ClientFirebase] Falha ao ler chave do Gemini do Firestore:", e);
      }

      if (!apiKey) {
        apiKey = (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : undefined) ||
                 ((import.meta as any).env?.VITE_GEMINI_API_KEY) ||
                 '';
      }

      if (!apiKey) {
        throw new Error("Chave API do Gemini não configurada. Salve sua chave no painel de Configurações (Aba Conexão Firebase) como Gestor para utilizar o Assistente de forma global.");
      }

      const ai = new GoogleGenAI({ apiKey });

      let activeDatabaseContext = "Nenhum dado ativo no momento.";
      try {
        const routes = importedRoutes || [];
        const auditList = audits || [];
        const valeList = vales || [];
        const driverList = drivers || [];

        const openRoutes = routes.filter((r: any) => r.status !== 'fechado');
        const closedRoutes = routes.filter((r: any) => r.status === 'fechado');

        const valesPendentes = valeList.filter((v: any) => v.status === 'PENDENTE_ASSINATURA');
        const valesAssinados = valeList.filter((v: any) => v.status === 'ASSINADO');
        const valesCompensados = valeList.filter((v: any) => v.status === 'COMPENSADO');

        activeDatabaseContext = `
DADOS ATIVOS EM TEMPO REAL DA UNIDADE:
- Rotas Importadas Totais: ${routes.length} (Abertas: ${openRoutes.length}, Fechadas: ${closedRoutes.length})
- Rotas em Aberto no momento: ${openRoutes.map((r: any) => `Mapa ${r.routeMap} (Placa ${r.plate}, Status ${r.status})`).join(', ') || 'Nenhuma'}
- Auditorias com Divergência Registradas: ${auditList.filter((a: any) => a.status === 'finalizado_divergente').length}
- Vales de Colaboradores: Total de ${valeList.length} vales.
  * Pendentes de assinatura: ${valesPendentes.length} vales (Total R$ ${valesPendentes.reduce((acc: number, curr: any) => acc + (curr.valor || 0), 0).toFixed(2)})
  * Assinados: ${valesAssinados.length} vales (Total R$ ${valesAssinados.reduce((acc: number, curr: any) => acc + (curr.valor || 0), 0).toFixed(2)})
  * Compensados/Descontados: ${valesCompensados.length} vales

Detalhes de Auditorias Ativas com Divergências de Sobras/Faltas de PA (Produto Acabado) e AG (Ativo de Giro):
${auditList.map((a: any) => {
  const driverName = driverList.find((d: any) => d.id === a.driverId)?.name || 'Desconhecido';
  const surplusPA = (a.items || []).filter((i: any) => (i.rePhysicalQty ?? i.physicalQty) > (i.fiscalQty ?? 0));
  const deficitPA = (a.items || []).filter((i: any) => (i.rePhysicalQty ?? i.physicalQty) < (i.fiscalQty ?? 0));
  const surplusAG = (a.assets || []).filter((as: any) => (as.rePhysicalQty ?? as.physicalQty) > (as.fiscalQty ?? 0));
  const deficitAG = (a.assets || []).filter((as: any) => (as.rePhysicalQty ?? as.physicalQty) < (as.fiscalQty ?? 0));

  let info = `* Mapa ${a.routeMap} (Placa: ${a.plate}, Motorista: ${driverName}, Status Geral: ${a.status}):\n`;
  if (surplusPA.length > 0) {
    info += `  - Sobras de PA (Produto Acabado): ${surplusPA.map((i: any) => `${i.productDescription} (+${(i.rePhysicalQty ?? i.physicalQty) - (i.fiscalQty ?? 0)} un)`).join(', ')}\n`;
  }
  if (deficitPA.length > 0) {
    info += `  - Faltas de PA (Produto Acabado): ${deficitPA.map((i: any) => `${i.productDescription} (-${(i.fiscalQty ?? 0) - (i.rePhysicalQty ?? i.physicalQty)} un)`).join(', ')}\n`;
  }
  if (surplusAG.length > 0) {
    info += `  - Sobras de AG (Ativo de Giro): ${surplusAG.map((as: any) => `${as.assetName} (+${(as.rePhysicalQty ?? as.physicalQty) - (as.fiscalQty ?? 0)} un)`).join(', ')}\n`;
  }
  if (deficitAG.length > 0) {
    info += `  - Faltas de AG (Ativo de Giro): ${deficitAG.map((as: any) => `${as.assetName} (-${(as.fiscalQty ?? 0) - (as.rePhysicalQty ?? as.physicalQty)} un)`).join(', ')}\n`;
  }
  if (a.correctiveActionNotes) {
    info += `  - Observação/Ação Corretiva: "${a.correctiveActionNotes}"\n`;
  }
  return info;
}).join('\n') || 'Nenhuma auditoria com divergência registrada no momento.'}

Lista de Vales de Faltas Gerados na Unidade por Colaborador:
${valeList.map((v: any) => `- Vale ID: ${v.id} | Colaborador: ${v.colaboradorName} (${v.colaboradorRole}) | Valor: R$ ${v.valor.toFixed(2)} | Motivo: ${v.descricao} | Status: ${v.status} | Obs: ${v.observacao || 'Sem observação'}`).join('\n') || 'Nenhum vale gerado.'}
`;
      } catch (dbError) {
        console.error("Erro ao obter dados dinâmicos para chat:", dbError);
      }

      const systemInstruction = `Você é o Assistente Virtual Inteligente da plataforma "Aferição de Retorno de Rota - Pau Brasil Distribuidora Ambev". 
Seu papel é tirar dúvidas dos usuários de forma prestativa, direta, simples e profissional, dando respostas EXTREMAMENTE ASSERTIVAS baseadas nos dados ativos e reais de faturamento e divergências da unidade.

Sobre a plataforma:
- A plataforma gerencia o retorno dos caminhões de rota da Pau Brasil Distribuidora Ambev.
- Existem 4 perfis/funções principais:
  1. Conferente de Pátio: Faz a contagem física (produtos e ativos como paletes/chapas/garrafeiras) dos caminhões que retornam. Pode pausar a conferência com justificativa se necessário.
  2. Auxiliar de Logística (Fiscal): Faz a conciliação/reconciliação fiscal comparando a contagem física do Conferente com o faturamento fiscal. Pode aprovar, aprovar com sobras/faltas ou solicitar recontagem (nova conferência) caso as divergências sejam injustificáveis. Também pode sincronizar planilhas.
  3. Monitoramento: Define previsões de chegada (ETA), tripStatus (se retorna no dia ou pernoita), observações de rota e monitora as viagens em tempo real.
  4. Gestor Master: Tem acesso ao Painel Gerencial (KPIs, tempos médios, produtividade) e Guias de Cadastro (gerenciar Motoristas, Veículos, Produtos e Usuários).

Regras de Negócio Importantes:
- PERNOITE: Quando um caminhão não retorna no mesmo dia e pernoita fora da distribuidora. O monitoramento atualiza isso para sinalizar ao pátio.
- RECONTAL / SOLICITAR RECONTAGEM: Quando o Fiscal identifica que a divergência está fora do aceitável, ele pode recusar e pedir que o Conferente refaça a contagem daquele item ou do mapa inteiro.
- PAUSA DE CONFERÊNCIA: O Conferente pode pausar uma conferência ativa por motivos urgentes (ex: ir ao banheiro, parada técnica, etc.), fornecendo uma observação obrigatória. Esta tela agora está totalmente visível e funcional.
- SOBRAS & FALTAS PA/AG: Divididos de forma organizada em Produtos Acabados (PA) e Ativos de Giro (AG). São as discrepâncias físicas versus fiscais geradas após a contagem.
- CONTROLE DE VALES: Quando ocorrem faltas físicas de mercadoria, pode ser gerado um Vale (desconto/compensação) com histórico de vales gerados para cada colaborador para controle do financeiro/gestão.

Aqui estão os dados operacionais ATIVOS da unidade em tempo real para responder de forma super precisa:
---------------------------
${activeDatabaseContext}
---------------------------
`;

      const contents = [
        ...newMessages
          .filter(m => m.id !== 'welcome')
          .slice(0, -1)
          .map(m => ({
            role: m.role,
            parts: [{ text: m.text }]
          })),
        {
          role: 'user',
          parts: [{ text: textToSend }]
        }
      ];

      let response;
      try {
        console.log("Tentando gerar resposta no cliente com gemini-3.5-flash...");
        response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: contents,
          config: {
            systemInstruction: systemInstruction,
          }
        });
      } catch (firstError: any) {
        console.warn("Falha no gemini-3.5-flash no cliente, tentando fallback para gemini-3.1-flash-lite...", firstError?.message || firstError);
        try {
          response = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite",
            contents: contents,
            config: {
              systemInstruction: systemInstruction,
            }
          });
        } catch (secondError: any) {
          console.warn("Falha no gemini-3.1-flash-lite no cliente, tentando fallback para gemini-2.5-flash...", secondError?.message || secondError);
          try {
            response = await ai.models.generateContent({
              model: "gemini-2.5-flash",
              contents: contents,
              config: {
                systemInstruction: systemInstruction,
              }
            });
          } catch (thirdError: any) {
            console.warn("Falha no gemini-2.5-flash no cliente, tentando fallback para gemini-1.5-flash...", thirdError?.message || thirdError);
            response = await ai.models.generateContent({
              model: "gemini-1.5-flash",
              contents: contents,
              config: {
                systemInstruction: systemInstruction,
              }
            });
          }
        }
      }

      if (response && response.text) {
        setMessages(prev => [
          ...prev,
          { id: `ai-${Date.now()}`, role: 'model', text: response.text! }
        ]);
        return true;
      } else {
        throw new Error("Resposta vazia da inteligência artificial no cliente.");
      }
    };

    // Helper to run server-side chat API call
    const runServerSideGemini = async () => {
      console.log("[ClientFirebase] Tentando usar o servidor (/api/chat) para o chat...");
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: textToSend,
          history: messages
            .filter(m => m.id !== 'welcome')
            .map(m => ({
              role: m.role,
              text: m.text
            }))
        })
      });

      let data: any = {};
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        try {
          data = await response.json();
        } catch (jsonErr) {
          console.error("Error parsing chat response JSON:", jsonErr);
        }
      }

      if (response.ok && data.text) {
        setMessages(prev => [
          ...prev,
          { id: `ai-${Date.now()}`, role: 'model', text: data.text }
        ]);
        return true;
      } else {
        throw new Error(data.error || `Servidor retornou erro ${response.status}`);
      }
    };

    // Local fallback response function
    const runLocalFallbackResponse = (query: string) => {
      const normalized = query.toLowerCase();
      let responseText = "";

      if (normalized.includes("conferência") || normalized.includes("conferencia") || normalized.includes("iniciar")) {
        responseText = `**Como Iniciar uma Conferência Física:**\n\n` +
          `Para iniciar a aferição física de um caminhão que retornou da rota, siga estes passos simples:\n\n` +
          `1. Certifique-se de estar logado com o perfil **Conferente de Pátio** (você pode alterar o usuário logado na barra superior).\n` +
          `2. No menu principal, vá para **Painel de Pátio**.\n` +
          `3. Localize o caminhão/rota desejado na lista de faturados e clique em **Iniciar Conferência**.\n` +
          `4. Faça a contagem de todos os itens e insira as quantidades físicas reais para Produtos Acabados (PA) e Ativos de Giro (AG).\n` +
          `5. Caso precise fazer uma pausa (parada técnica, banheiro, etc.), clique em **Pausar** e informe o motivo. Para retomar, basta clicar em **Retomar**.\n` +
          `6. Ao finalizar a contagem de todos os itens, clique em **Finalizar Conferência** para enviar os dados para a Reconciliação Fiscal.`;
      } else if (normalized.includes("pernoite")) {
        responseText = `**Como Funciona o Pernoite de Rota:**\n\n` +
          `O status de **Pernoite** é aplicado quando um caminhão de rota não consegue retornar à distribuidora no mesmo dia de faturamento e precisa passar a noite fora da unidade.\n\n` +
          `• **Ação do Monitoramento:** O operador de monitoramento abre a rota no painel e altera o status de viagem (*tripStatus*) para **Pernoite**.\n` +
          `• **Visibilidade:** O pátio e o faturamento recebem esse alerta visual instantaneamente em suas telas, sabendo que aquele caminhão não retornará no turno atual.\n` +
          `• **Retorno:** No dia seguinte, quando o caminhão chegar com segurança na unidade, ele é recebido para a conferência de pátio normal.`;
      } else if (normalized.includes("sobras") || normalized.includes("sobra") || normalized.includes("sobrar")) {
        responseText = `**Procedimento em caso de Sobras de Mercadoria:**\n\n` +
          `Se o Conferente identificar que a contagem física de um item é **maior** do que a quantidade faturada na nota fiscal, isso é registrado como uma Sobra:\n\n` +
          `1. O Conferente insere a quantidade física exata contada. O sistema calculará a sobra automaticamente.\n` +
          `2. Na tela de Reconciliação Fiscal, o **Auxiliar de Logística (Fiscal)** verá o item destacado com a cor amarela indicando a sobra.\n` +
          `3. O Fiscal deve investigar o motivo junto ao motorista (ex: erro de carregamento no pátio de manhã ou mercadoria não faturada de outra rota).\n` +
          `4. Se a justificativa for aceitável, o Fiscal pode aprovar com a observação correspondente. Caso contrário, ele pode **Solicitar Recontagem** para garantir que não houve erro na contagem física.`;
      } else if (normalized.includes("recontagem") || normalized.includes("fiscal") || normalized.includes("recusar")) {
        responseText = `**Como Solicitar Recontagem Fiscal:**\n\n` +
          `Se houver divergências de Sobras ou Faltas sem justificativa clara ou se o Fiscal suspeitar de um erro na contagem física do Conferente, ele pode recusar a contagem e pedir que seja refeita:\n\n` +
          `1. Acesse o sistema com o perfil **Auxiliar de Logística (Fiscal)**.\n` +
          `2. Abra a rota que está com status 'conferido' pendente de análise.\n` +
          `3. Clique no botão **Solicitar Recontagem** na parte inferior da tela.\n` +
          `4. O status da rota mudará imediatamente para 'Pendente de Recontagem' e o caminhão ficará disponível novamente no painel do **Conferente de Pátio** para que a contagem seja feita do zero.`;
      } else {
        responseText = `Olá! Sou o Assistente Virtual Inteligente da Pau Brasil Distribuidora Ambev.\n\n` +
          `Atualmente estou operando no **Modo de Resposta Local Inteligente**, pois não encontrei uma chave API do Gemini configurada nas Secrets ou no painel do aplicativo.\n\n` +
          `💡 **Como habilitar meu cérebro de Inteligência Artificial completo?**\n` +
          `1. Vá até o menu lateral esquerdo e clique na aba **Conexão Firebase Store**.\n` +
          `2. Role até o card **Configurações do Assistente de Inteligência Artificial (Gemini I.A.)**.\n` +
          `3. Cole sua chave de API do Gemini (obtida gratuitamente em [Google AI Studio](https://aistudio.google.com/)).\n` +
          `4. Clique em **Salvar**. A chave será sincronizada globalmente no banco Firestore e o assistente de I.A. passará a responder perguntas dinâmicas e inteligentes analisando todos os faturamentos e auditorias ativas em tempo real!`;
      }

      setMessages(prev => [
        ...prev,
        { id: `ai-${Date.now()}`, role: 'model', text: responseText }
      ]);
    };

    // Execution logic with automatic fallbacks
    if (isStaticDeployment) {
      // Preference: client-side (for GitHub pages)
      try {
        await runClientSideGemini();
      } catch (clientErr: any) {
        console.warn("Client-side execution failed, trying server-side as last resort...", clientErr);
        try {
          await runServerSideGemini();
        } catch (serverErr: any) {
          console.error("Both client and server paths failed in static deployment mode. Using local fallback.");
          runLocalFallbackResponse(textToSend);
        }
      } finally {
        setIsLoading(false);
      }
    } else {
      // Preference: server-side (for dynamic Google AI Studio dev container)
      try {
        await runServerSideGemini();
      } catch (serverErr: any) {
        console.warn("Server-side execution failed or is unconfigured. Falling back to local client-side...", serverErr);
        try {
          await runClientSideGemini();
        } catch (clientErr: any) {
          console.error("Both client and server paths failed in full-stack deployment mode. Using local fallback.");
          runLocalFallbackResponse(textToSend);
        }
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage(inputText);
  };

  return (
    <div className="fixed bottom-3 right-3 sm:bottom-6 sm:right-6 z-40 font-sans max-w-[calc(100vw-1.5rem)]" id="ai_agent_chat_wrapper">
      {/* Floating Action Button (FAB) */}
      {!isOpen && (
        <button
          id="ai_chat_fab_button"
          onClick={() => setIsOpen(true)}
          className="relative group bg-[#0f35a9] hover:bg-[#0c2a86] text-white p-3.5 sm:p-4 rounded-full shadow-2xl transition-all duration-300 flex items-center justify-center cursor-pointer border border-[#0f35a9]/50 hover:scale-105"
          title="Fale com a Inteligência Artificial"
        >
          {hasNewMessage && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500 text-[10px] font-extrabold text-white items-center justify-center">1</span>
            </span>
          )}
          <Bot className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
          <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-500 ease-in-out whitespace-nowrap text-xs font-bold pl-0 group-hover:pl-2">
            Dúvidas? Fale com a I.A
          </span>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div 
          id="ai_chat_window"
          className="bg-white rounded-2xl shadow-3xl border border-slate-200 w-[calc(100vw-1.5rem)] max-w-sm sm:w-96 h-[480px] flex flex-col overflow-hidden animate-fade-in"
        >
          {/* Header */}
          <div className="bg-slate-900 px-4 py-3 flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 bg-[#0f35a9]/10 rounded-lg border border-[#0f35a9]/30">
                <Sparkles className="h-4 w-4 text-amber-400 animate-pulse" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white leading-none flex items-center gap-1">
                  Assistente Pau Brasil
                  <span className="bg-[#0f35a9] text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold">I.A</span>
                </h4>
                <p className="text-[10px] text-slate-400 mt-0.5">Operações Pau Brasil Ambev</p>
              </div>
            </div>
            <button
              id="ai_chat_close_button"
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white p-1 rounded-lg transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages List */}
          <div className="flex-1 overflow-y-auto p-4 bg-slate-50 space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2.5 max-w-[85%] ${
                  msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''
                }`}
              >
                <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 border ${
                  msg.role === 'user' 
                    ? 'bg-slate-200 border-slate-300 text-slate-700' 
                    : 'bg-[#0f35a9]/10 border-[#0f35a9]/20 text-[#0f35a9]'
                }`}>
                  {msg.role === 'user' ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                </div>
                
                <div className={`p-3 rounded-2xl text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-[#0f35a9] text-white rounded-tr-none'
                    : 'bg-white text-slate-700 shadow-3xs border border-slate-100 rounded-tl-none'
                }`}>
                  <p className="whitespace-pre-line">{msg.text}</p>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-2.5 max-w-[85%]">
                <div className="h-7 w-7 rounded-full bg-[#0f35a9]/10 border-[#0f35a9]/20 text-[#0f35a9] flex items-center justify-center">
                  <Bot className="h-3.5 w-3.5" />
                </div>
                <div className="p-3 bg-white border border-slate-100 rounded-2xl rounded-tl-none flex items-center space-x-1.5 shadow-3xs">
                  <span className="w-1.5 h-1.5 bg-[#0f35a9] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-1.5 h-1.5 bg-[#0f35a9] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-1.5 h-1.5 bg-[#0f35a9] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Suggestions */}
          {messages.length === 1 && !isLoading && (
            <div className="px-4 py-2 bg-slate-100/50 border-t border-slate-100 flex flex-wrap gap-1.5">
              {quickQuestions.map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(q)}
                  className="bg-white hover:bg-slate-50 border border-slate-200 text-[10px] text-slate-600 hover:text-slate-800 font-medium px-2 py-1 rounded-lg transition text-left shrink-0 cursor-pointer"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input Form */}
          <form 
            onSubmit={handleSubmit} 
            className="p-3 bg-white border-t border-slate-200 flex items-center gap-2"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Digite sua dúvida sobre o sistema..."
              disabled={isLoading}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#0f35a9] focus:border-[#0f35a9] transition disabled:opacity-60"
            />
            <button
              id="ai_chat_send_button"
              type="submit"
              disabled={!inputText.trim() || isLoading}
              className="bg-[#0f35a9] hover:bg-[#0c2a86] text-white p-2 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              title="Enviar mensagem"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

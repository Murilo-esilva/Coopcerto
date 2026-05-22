/**
 * Coopcerto Portal - Aplicação de Busca e Filtro de Estabelecimentos
 * ============================================================
 * Gerencia carregamento, processamento e renderização de dados
 */

// ============================================
// STATE MANAGEMENT
// ============================================

class AppState {
    constructor() {
        this.db = [];
        this.debounceTimer = null;
        this.htmlCache = {};
        this.filteredDataCache = null;
    }

    reset() {
        this.db = [];
        this.htmlCache = {};
        this.filteredDataCache = null;
    }
}

// ============================================
// DOM ELEMENTS
// ============================================

const state = new AppState();

const DOM = {
    fileInput: document.getElementById('file-input'),
    loadStatus: document.getElementById('load-status'),
    container: document.getElementById('cards-container'),
    searchInput: document.getElementById('search-input'),
    productFilter: document.getElementById('product-filter'),
    totalCount: document.getElementById('total-count'),
    placeholder: document.getElementById('status-placeholder'),
    placeholderIcon: document.getElementById('placeholder-icon'),
    placeholderText: document.getElementById('placeholder-text'),
    placeholderSubtext: document.getElementById('placeholder-subtext'),
    uploadProgressContainer: document.getElementById('upload-progress-container'),
    uploadProgress: document.getElementById('upload-progress'),
    progressText: document.getElementById('progress-text')
};

// ============================================
// DATA NORMALIZATION
// ============================================

/**
 * Normaliza propriedades de JSON para formato padrão
 * @param {Array} rawData - Dados brutos do JSON
 * @returns {Array} Dados normalizados
 */
function normalizeData(rawData) {
    return rawData.map(item => ({
        cnpj: item["CNPJ"] || "N/A",
        razao: item["RAZAO SOCIAL"] || "N/A",
        fantasia: item["NOME FANTASIA"] || item["RAZAO SOCIAL"] || "N/A",
        endereco: item["ENDERECO"] || "N/A",
        bairro: item["BAIRRO"] || "N/A",
        cidade: item["CIDADE"] || "N/A",
        uf: item["UF"] || "N/A",
        produto: item["PRODUTO HABILITADO"] || "Não Informado",
        ultimaVenda: item["ÚLTIMA VENDA COOPCERTO"] || "N/A",
        tempoCadastro: item["TEMPO DE CADASTRO"] || "N/A",
        dataBase: item["DATA BASE"] || "N/A"
    }));
}

/**
 * Processa arquivo CSV/TXT e retorna dados normalizados
 * @param {string} text - Conteúdo do arquivo
 * @returns {Object} {data: Array, products: Set}
 */
function parseCSVData(text) {
    const lines = text.split(/\r?\n/);
    const records = [];
    const detectedProducts = new Set();
    let headerProcessed = false;

    lines.forEach((line, index) => {
        if (!line.trim()) return;

        if (!headerProcessed && index === 0) {
            headerProcessed = true;
            return;
        }

        const columns = line.includes('\t') ? line.split('\t') : line.split(';');

        if (columns.length >= 8) {
            try {
                const cleanColumn = (col, defaultVal = "N/A") => 
                    (col?.trim() || defaultVal).replace(/\s+/g, ' ');

                const record = {
                    cnpj: cleanColumn(columns[0]),
                    razao: cleanColumn(columns[1]),
                    fantasia: cleanColumn(columns[2]) || cleanColumn(columns[1]),
                    endereco: cleanColumn(columns[3]),
                    bairro: cleanColumn(columns[4]),
                    cidade: cleanColumn(columns[5]),
                    uf: cleanColumn(columns[6]),
                    produto: cleanColumn(columns[7], "Não Informado"),
                    ultimaVenda: cleanColumn(columns[8]),
                    tempoCadastro: cleanColumn(columns[9]),
                    dataBase: cleanColumn(columns[10])
                };

                if (record.endereco !== "N/A" && record.bairro !== "N/A") {
                    records.push(record);
                    detectedProducts.add(record.produto);
                }
            } catch (e) {
                console.warn(`Erro ao processar linha ${index}:`, e);
            }
        }
    });

    return { data: records, products: detectedProducts };
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Escapa conteúdo HTML para prevenir XSS
 * @param {string} text - Texto a escapar
 * @returns {string} Texto escapado
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Determina a cor do badge baseado no tipo de produto
 * @param {string} product - Tipo de produto
 * @returns {string} Classes Tailwind para o badge
 */
function getBadgeClass(product) {
    const productLower = product.toLowerCase();
    
    if (productLower.includes("refeição") && productLower.includes("alimentação")) {
        return "bg-blue-50 text-blue-700 border-blue-200";
    } else if (productLower.includes("refeição")) {
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
    }
    
    return "bg-amber-50 text-amber-700 border-amber-200";
}

/**
 * Gera link do Google Maps baseado em localização
 * @param {Object} item - Registro do estabelecimento
 * @returns {string} URL do Google Maps
 */
function generateMapsLink(item) {
    const location = `${item.endereco}, ${item.bairro}, ${item.cidade} - ${item.uf}`;
    return `https://www.google.com/maps/search/${encodeURIComponent(location)}`;
}

/**
 * Mostra ou esconde o placeholder de estado
 * @param {boolean} show - Se deve mostrar
 * @param {string} text - Texto principal
 * @param {string} subtext - Subtexto
 */
function showPlaceholder(show, text, subtext) {
    if (show) {
        DOM.placeholder.classList.remove('hidden');
        DOM.placeholderIcon.className = "fa-regular fa-face-frown text-5xl mb-4 text-gray-300 block";
        DOM.placeholderText.textContent = text;
        DOM.placeholderSubtext.textContent = subtext;
    } else {
        DOM.placeholder.classList.add('hidden');
    }
}

/**
 * Atualiza o status de carregamento
 * @param {string} message - Mensagem a exibir
 */
function updateLoadStatus(message) {
    DOM.loadStatus.textContent = message;
}

/**
 * Anuncia mudanças para leitores de tela
 * @param {string} message - Mensagem a anunciar
 */
function announceToScreenReader(message) {
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.textContent = message;
    document.body.appendChild(announcement);
    setTimeout(() => announcement.remove(), 1000);
}

// ============================================
// CARD GENERATION
// ============================================

/**
 * Gera HTML do card uma única vez e o cacheia
 * @param {Object} item - Dados do estabelecimento
 * @param {number} index - Índice no array
 * @returns {string} HTML do card
 */
function generateCardHtml(item, index) {
    if (state.htmlCache[index]) return state.htmlCache[index];

    const badgeClass = getBadgeClass(item.produto);
    const mapsLink = generateMapsLink(item);

    const cardHtml = `
        <div class="bg-white rounded-xl shadow-xs border border-gray-100 hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group">
            <div class="p-5">
                <div class="flex justify-between items-start gap-2 mb-3">
                    <span class="px-2.5 py-0.5 text-[11px] font-semibold rounded-full border ${badgeClass}">
                        ${escapeHtml(item.produto)}
                    </span>
                    <span class="text-[10px] text-gray-400 font-mono" title="CNPJ">${escapeHtml(item.cnpj)}</span>
                </div>
                
                <h3 class="font-bold text-gray-900 text-lg group-hover:text-emerald-600 transition-colors line-clamp-2" title="Nome Fantasia">
                    ${escapeHtml(item.fantasia)}
                </h3>
                <p class="text-xs text-gray-400 mt-0.5 mb-4 truncate" title="Razão Social">
                    <strong>Razão:</strong> ${escapeHtml(item.razao)}
                </p>
                
                <div class="space-y-2 text-sm text-gray-600 border-b border-gray-100 pb-4 mb-4">
                    <p class="flex items-start gap-2">
                        <i class="fa-solid fa-location-dot text-gray-400 mt-1 shrink-0" aria-hidden="true"></i>
                        <span class="line-clamp-2">${escapeHtml(item.endereco)}</span>
                    </p>
                    <p class="flex items-center gap-2">
                        <i class="fa-solid fa-map-pin text-gray-400 shrink-0" aria-hidden="true"></i>
                        <span>${escapeHtml(item.bairro)} — <strong class="text-gray-700 font-normal">${escapeHtml(item.cidade)}/${escapeHtml(item.uf)}</strong></span>
                    </p>
                </div>

                <div class="grid grid-cols-2 gap-y-2 gap-x-1 text-[11px] text-gray-500 bg-gray-50 p-2 rounded border border-gray-100 font-mono">
                    <div><strong class="text-gray-400 block font-sans">Última Venda:</strong> ${escapeHtml(item.ultimaVenda)}</div>
                    <div><strong class="text-gray-400 block font-sans">Tempo Cad.:</strong> ${escapeHtml(item.tempoCadastro)}</div>
                    <div class="col-span-2 border-t border-gray-200/60 mt-1 pt-1"><strong class="text-gray-400 inline font-sans">Data Base:</strong> ${escapeHtml(item.dataBase)}</div>
                </div>
            </div>

            <div class="p-4 bg-gray-50/70 border-t border-gray-100">
                <a href="${mapsLink}" 
                   target="_blank" 
                   rel="noopener noreferrer"
                   class="w-full inline-flex justify-center items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 font-semibold rounded-lg text-xs hover:bg-emerald-50 hover:border-emerald-300 transition-colors"
                   aria-label="Abrir localização de ${escapeHtml(item.fantasia)} no Google Maps">
                    <i class="fa-solid fa-map-location-dot text-emerald-500" aria-hidden="true"></i> Rota no Google Maps
                </a>
            </div>
        </div>
    `;

    state.htmlCache[index] = cardHtml;
    return cardHtml;
}

/**
 * Renderiza cards na tela baseado em dados filtrados
 * @param {Array} data - Dados para renderizar
 */
function drawCards(data) {
    DOM.container.innerHTML = '';
    DOM.totalCount.textContent = data.length;

    if (data.length === 0) {
        showPlaceholder(true, "Nenhum resultado encontrado", "Tente digitar termos diferentes ou limpe os filtros de pesquisa.");
        announceToScreenReader("Nenhum resultado encontrado");
        return;
    }

    showPlaceholder(false);

    const fragment = document.createDocumentFragment();
    const tempDiv = document.createElement('div');

    data.forEach((item) => {
        const originalIndex = state.db.indexOf(item);
        tempDiv.innerHTML = generateCardHtml(item, originalIndex);
        fragment.appendChild(tempDiv.firstElementChild);
    });

    DOM.container.appendChild(fragment);
    announceToScreenReader(`${data.length} estabelecimentos encontrados`);
}

// ============================================
// FILTERING & SEARCH
// ============================================

/**
 * Aplica filtros de busca e produto
 */
function applyFilters() {
    const query = DOM.searchInput.value.toLowerCase().trim();
    const selectedProduct = DOM.productFilter.value;

    const filteredData = state.db.filter(item => {
        const matchesSearch = 
            item.fantasia.toLowerCase().includes(query) ||
            item.razao.toLowerCase().includes(query) ||
            item.bairro.toLowerCase().includes(query) ||
            item.endereco.toLowerCase().includes(query) ||
            item.cnpj.includes(query);

        const matchesProduct = (selectedProduct === 'todos') || (item.produto === selectedProduct);

        return matchesSearch && matchesProduct;
    });

    state.filteredDataCache = filteredData;
    drawCards(filteredData);
}

/**
 * Limpa todos os filtros
 */
function clearAllFilters() {
    DOM.searchInput.value = '';
    DOM.productFilter.value = 'todos';
    applyFilters();
    DOM.searchInput.focus();
}

// ============================================
// DATA LOADING
// ============================================

/**
 * Carrega dados de data.json automaticamente
 */
async function loadJsonData() {
    try {
        const response = await fetch('data.json');
        if (!response.ok) throw new Error('Arquivo não encontrado');
        
        const rawData = await response.json();
        state.db = normalizeData(rawData);
        
        if (state.db.length > 0) {
            updateLoadStatus(`Dados carregados (${state.db.length} registros)`);
            initializeApp();
        } else {
            updateLoadStatus("Sem dados disponíveis");
            showPlaceholder(true, "Nenhum dado disponível", "O arquivo data.json está vazio ou não contém registros válidos.");
        }
    } catch (error) {
        console.error("Erro ao carregar data.json:", error);
        updateLoadStatus("Erro ao carregar dados");
        showPlaceholder(true, "Erro ao carregar", "Verifique se o arquivo data.json existe e está no formato correto.");
    }
}

/**
 * Processa arquivo CSV/TXT carregado pelo usuário
 * @param {File} file - Arquivo enviado
 */
function handleFileUpload(file) {
    if (!file) return;

    updateLoadStatus("Processando...");
    DOM.uploadProgressContainer.classList.remove('hidden');
    
    const reader = new FileReader();

    reader.onprogress = (event) => {
        if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 100);
            DOM.uploadProgress.value = percentComplete;
            DOM.progressText.textContent = `${percentComplete}%`;
        }
    };

    reader.onload = (evt) => {
        try {
            const text = evt.target.result;
            const { data, products } = parseCSVData(text);
            
            state.reset();
            state.db = data;

            if (state.db.length > 0) {
                updateLoadStatus(`${file.name} (${state.db.length} registros)`);
                populateProductFilter(products);
                state.db.forEach((item, index) => generateCardHtml(item, index));
                applyFilters();
            } else {
                updateLoadStatus("Erro na leitura");
                alert("Não foi possível identificar dados válidos. Verifique se o arquivo possui colunas separadas por tabulação ou ponto e vírgula.");
            }
        } catch (error) {
            updateLoadStatus("Erro no processamento");
            console.error("Erro ao processar arquivo:", error);
            alert("Ocorreu um erro ao processar o arquivo. Verifique o console para mais detalhes.");
        } finally {
            DOM.uploadProgressContainer.classList.add('hidden');
            DOM.fileInput.value = '';
        }
    };

    reader.onerror = () => {
        updateLoadStatus("Erro na leitura");
        alert("Erro ao ler o arquivo.");
        DOM.uploadProgressContainer.classList.add('hidden');
    };

    reader.readAsText(file, 'UTF-8');
}

/**
 * Popula o filtro de produtos detectados
 * @param {Set} products - Conjunto de produtos
 */
function populateProductFilter(products) {
    DOM.productFilter.innerHTML = '<option value="todos">Todos os Produtos</option>';
    Array.from(products)
        .sort()
        .forEach(prod => {
            const option = document.createElement('option');
            option.value = prod;
            option.textContent = prod;
            DOM.productFilter.appendChild(option);
        });
}

/**
 * Inicializa a aplicação após carregar dados
 */
function initializeApp() {
    DOM.searchInput.disabled = false;
    DOM.productFilter.disabled = false;
    
    // Pré-gera todos os cards
    state.db.forEach((item, index) => generateCardHtml(item, index));
    
    // Popula filtro de produtos
    const detectedProducts = new Set(state.db.map(item => item.produto));
    populateProductFilter(detectedProducts);

    applyFilters();
}

// ============================================
// EVENT LISTENERS
// ============================================

// Carrega JSON ao iniciar a página
window.addEventListener('load', loadJsonData);

// Upload manual de arquivo
DOM.fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    handleFileUpload(file);
});

// Busca com debouncing
DOM.searchInput.addEventListener('input', () => {
    clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(applyFilters, 500);
});

// Mudança de filtro de produto
DOM.productFilter.addEventListener('change', applyFilters);

// Limpar busca com ESC
DOM.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        clearAllFilters();
    }
});

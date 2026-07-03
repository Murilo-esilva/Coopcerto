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
    cityFilter: document.getElementById('city-filter'),
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
 * Suporta variações de nomes de campos (com e sem espaços/underscores)
 * @param {Array} rawData - Dados brutos do JSON
 * @returns {Array} Dados normalizados
 */
function normalizeData(rawData) {
    return rawData.map(item => {
        // Função auxiliar para buscar valor com múltiplas variações de chave
        const getValue = (keys) => {
            for (let key of keys) {
                if (item[key]) return item[key];
            }
            return "N/A";
        };

        return {
            cnpj: getValue(["CNPJ"]),
            razao: getValue(["RAZAO_SOCIAL", "RAZAO SOCIAL"]),
            fantasia: getValue(["NOME_FANTASIA", "NOME FANTASIA"]) || getValue(["RAZAO_SOCIAL", "RAZAO SOCIAL"]),
            endereco: getValue(["ENDERECO", "ENDEREÇO"]),
            bairro: getValue(["BAIRRO"]),
            cidade: getValue(["CIDADE"]),
            uf: getValue(["UF"]),
            produto: getValue(["PRODUTO_HABILITADO", "PRODUTO HABILITADO", "PRODUTO"]),
            ultimaVenda: getValue(["ULTIMA_VENDA_COOPCERTO", "ÚLTIMA VENDA COOPCERTO"]),
            tempoCadastro: getValue(["TEMPO_DE_CADASTRO", "TEMPO DE CADASTRO"]),
            dataBase: getValue(["DATA_BASE", "DATA BASE"])
        };
    });
}

/**
 * Processa arquivo CSV/TXT e retorna dados normalizados
 * @param {string} text - Conteúdo do arquivo
 * @returns {Object} {data: Array, products: Set, cities: Set}
 */
function parseCSVData(text) {
    const lines = text.split(/\r?\n/);
    const records = [];
    const detectedProducts = new Set();
    const detectedCities = new Set();
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
                    if (record.cidade && record.cidade !== 'N/A') detectedCities.add(record.cidade);
                }
            } catch (e) {
                console.warn(`Erro ao processar linha ${index}:`, e);
            }
        }
    });

    return { data: records, products: detectedProducts, cities: detectedCities };
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Normaliza strings para busca: remove acentos, trim, lowercase
 * @param {string} s
 * @returns {string}
 */
function normalizeString(s) {
    if (!s && s !== 0) return '';
    return String(s)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

/**
 * Prepara registros adicionando campos auxiliares para busca (_search)
 * @param {Array} records
 * @returns {Array}
 */
function prepareRecords(records) {
    return records.map(item => {
        const searchParts = [
            item.fantasia,
            item.razao,
            item.endereco,
            item.bairro,
            item.cidade,
            item.cnpj
        ].map(normalizeString).filter(Boolean);

        return {
            ...item,
            _search: searchParts.join(' '),
            _cidadeNorm: normalizeString(item.cidade)
        };
    });
}

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
        return "bg-blue-50 dark:bg-blue-900 text-blue-700 dark:text-blue-200 border-blue-200 dark:border-blue-700";
    } else if (productLower.includes("refeição")) {
        return "bg-emerald-50 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-200 border-emerald-200 dark:border-emerald-700";
    }
    
    return "bg-amber-50 dark:bg-amber-900 text-amber-700 dark:text-amber-200 border-amber-200 dark:border-amber-700";
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
        DOM.placeholderIcon.className = "fa-regular fa-face-frown text-5xl mb-4 text-gray-300 dark:text-gray-600 block";
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
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xs border border-gray-100 dark:border-gray-700 hover:shadow-md dark:hover:shadow-lg transition-all flex flex-col justify-between overflow-hidden group">
            <div class="p-5">
                <div class="flex justify-between items-start gap-2 mb-3">
                    <span class="px-2.5 py-0.5 text-[11px] font-semibold rounded-full border ${badgeClass}">
                        ${escapeHtml(item.produto)}
                    </span>
                    <span class="text-[10px] text-gray-400 dark:text-gray-500 font-mono" title="CNPJ">${escapeHtml(item.cnpj)}</span>
                </div>
                
                <h3 class="font-bold text-gray-900 dark:text-gray-100 text-lg group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors line-clamp-2" title="Nome Fantasia">
                    ${escapeHtml(item.fantasia)}
                </h3>
                <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5 mb-4 truncate" title="Razão Social">
                    <strong>Razão:</strong> ${escapeHtml(item.razao)}
                </p>
                
                <div class="space-y-2 text-sm text-gray-600 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700 pb-4 mb-4">
                    <p class="flex items-start gap-2">
                        <i class="fa-solid fa-location-dot text-gray-400 dark:text-gray-500 mt-1 shrink-0" aria-hidden="true"></i>
                        <span class="line-clamp-2">${escapeHtml(item.endereco)}</span>
                    </p>
                    <p class="flex items-center gap-2">
                        <i class="fa-solid fa-map-pin text-gray-400 dark:text-gray-500 shrink-0" aria-hidden="true"></i>
                        <span>${escapeHtml(item.bairro)} — <strong class="text-gray-700 dark:text-gray-300 font-normal">${escapeHtml(item.cidade)}/${escapeHtml(item.uf)}</strong></span>
                    </p>
                </div>

                <div class="grid grid-cols-2 gap-y-2 gap-x-1 text-[11px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 p-2 rounded border border-gray-100 dark:border-gray-600 font-mono">
                    <div><strong class="text-gray-400 dark:text-gray-500 block font-sans">Última Venda:</strong> ${escapeHtml(item.ultimaVenda)}</div>
                    <div><strong class="text-gray-400 dark:text-gray-500 block font-sans">Tempo Cad.:</strong> ${escapeHtml(item.tempoCadastro)}</div>
                    <div class="col-span-2 border-t border-gray-200 dark:border-gray-600 mt-1 pt-1"><strong class="text-gray-400 dark:text-gray-500 inline font-sans">Data Base:</strong> ${escapeHtml(item.dataBase)}</div>
                </div>
            </div>

            <div class="p-4 bg-gray-50 dark:bg-gray-700 border-t border-gray-100 dark:border-gray-600">
                <a href="${mapsLink}" 
                   target="_blank" 
                   rel="noopener noreferrer"
                   class="w-full inline-flex justify-center items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold text-sm rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900 hover:border-emerald-200 dark:hover:border-emerald-700 transition-colors duration-200"
                   aria-label="Abrir localização de ${escapeHtml(item.fantasia)} no Google Maps">
                    <i class="fa-solid fa-map-location-dot text-emerald-500 dark:text-emerald-400" aria-hidden="true"></i> Rota no Google Maps
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
 * Aplica filtros de busca, produto e cidade
 */
function applyFilters() {
    const query = DOM.searchInput.value || '';
    const qNorm = normalizeString(query);
    const selectedProduct = DOM.productFilter ? DOM.productFilter.value : 'todos';
    const selectedCity = DOM.cityFilter ? DOM.cityFilter.value : 'todas';

    const filteredData = state.db.filter(item => {
        const matchesSearch = !qNorm || (item._search && item._search.includes(qNorm));
        const matchesProduct = (selectedProduct === 'todos') || (item.produto === selectedProduct);
        const matchesCity = (selectedCity === 'todas') || (item._cidadeNorm === selectedCity);

        return matchesSearch && matchesProduct && matchesCity;
    });

    state.filteredDataCache = filteredData;
    drawCards(filteredData);
}

/**
 * Limpa todos os filtros
 */
function clearAllFilters() {
    DOM.searchInput.value = '';
    if (DOM.productFilter) DOM.productFilter.value = 'todos';
    if (DOM.cityFilter) DOM.cityFilter.value = 'todas';
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
        console.log(`✓ Dados brutos carregados: ${rawData.length} registros`);
        
        const normalized = normalizeData(rawData);
        console.log(`✓ Dados normalizados: ${normalized.length} registros`);
        
        state.db = prepareRecords(normalized);
        console.log(`✓ Dados preparados: ${state.db.length} registros`);
        
        if (state.db.length > 0) {
            updateLoadStatus(`Dados carregados (${state.db.length} registros)`);
            initializeApp();
        } else {
            updateLoadStatus("Sem dados disponíveis");
            showPlaceholder(true, "Nenhum dado disponível", "O arquivo data.json está vazio ou não contém registros válidos.");
        }
    } catch (error) {
        console.error("❌ Erro ao carregar data.json:", error);
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
            const { data, products, cities } = parseCSVData(text);
            
            state.reset();
            state.db = prepareRecords(data);

            if (state.db.length > 0) {
                updateLoadStatus(`${file.name} (${state.db.length} registros)`);
                populateProductFilter(products);
                populateCityFilter(cities);
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
    if (!DOM.productFilter) return;
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
 * Popula o filtro de cidades detectadas
 * @param {Set} cities - Conjunto de cidades
 */
function populateCityFilter(cities) {
    if (!DOM.cityFilter) return;
    DOM.cityFilter.innerHTML = '<option value="todas">Todas as Cidades</option>';
    Array.from(cities)
        .sort((a, b) => normalizeString(a).localeCompare(normalizeString(b)))
        .forEach(city => {
            const option = document.createElement('option');
            option.value = normalizeString(city);
            option.textContent = city;
            DOM.cityFilter.appendChild(option);
        });
}

/**
 * Inicializa a aplicação após carregar dados
 */
function initializeApp() {
    DOM.searchInput.disabled = false;
    if (DOM.productFilter) DOM.productFilter.disabled = false;
    if (DOM.cityFilter) DOM.cityFilter.disabled = false;
    
    // Pré-gera todos os cards
    state.db.forEach((item, index) => generateCardHtml(item, index));
    
    // Popula filtro de produtos e cidades
    const detectedProducts = new Set(state.db.map(item => item.produto));
    populateProductFilter(detectedProducts);

    const detectedCities = new Set(state.db.map(item => item.cidade).filter(Boolean));
    populateCityFilter(detectedCities);

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
if (DOM.productFilter) DOM.productFilter.addEventListener('change', applyFilters);

// Mudança de filtro de cidade
if (DOM.cityFilter) DOM.cityFilter.addEventListener('change', applyFilters);

// Limpar busca com ESC
DOM.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        clearAllFilters();
    }
});

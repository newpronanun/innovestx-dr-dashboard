let drData = [];
let filteredData = [];
let unreleasedDRs = new Set();
let currentLwChart = null;
let currentLwSeries = null;
let drSeries = null;
let currentChartType = 'candle';
let currentChartTimeframe = '1D';

function getCurrency(country, exchange) {
    if (!exchange) exchange = '';
    exchange = exchange.toUpperCase();
    if (['NYSE', 'NASDAQ'].includes(exchange)) return 'USD';
    if (exchange === 'HKEX') return 'HKD';
    if (exchange === 'TSE') return 'JPY';
    if (['SSE', 'SZSE'].includes(exchange)) return 'CNY';
    if (exchange === 'SGX') return 'SGD';
    if (exchange === 'EURONEXT') return 'EUR';
    if (country === 'United States') return 'USD';
    if (country === 'Japan') return 'JPY';
    if (country === 'China') return 'CNY'; 
    return '';
}

function getTMinus1FXRate(currency, currentDate) {
    if (!window.FX_CHART_DATA || !window.FX_CHART_DATA[currency]) return null;
    
    const dates = Object.keys(window.FX_CHART_DATA[currency]).sort(); 
    for (let i = dates.length - 1; i >= 0; i--) {
        if (dates[i] < currentDate) {
            return window.FX_CHART_DATA[currency][dates[i]];
        }
    }
    return window.FX_CHART_DATA[currency][dates[0]] || 1; 
}

function calculateDRPrice(underlyingPrice, fxRate, conversionRatioStr) {
    if (!underlyingPrice || !fxRate || !conversionRatioStr) return null;
    let ratio = parseFloat(conversionRatioStr);
    if (isNaN(ratio) || ratio <= 0) return null;
    return (underlyingPrice * fxRate) / ratio;
}

const criteriaInfo = {
    RiskLevel: {
        "Low Risk": "Strictly Beta < 0.8 (Includes stable dividend ETFs)",
        "Moderate Risk": "Strictly Beta between 0.8 and 1.2 inclusive (Includes broad market ETFs)",
        "High Risk": "Strictly Beta > 1.2 (Includes growth sector/science board ETFs, private firms, and tech startups)"
    },
    RiskLabel: {
        "Defensive": "Stable sectors (Healthcare, Staples, Utilities, Telecoms) or Beta < 0.8",
        "Cyclical": "Economically sensitive sectors (Materials, Energy, Financials, traditional Industrials) with Beta >= 0.8",
        "Stable Growth": "Established tech/communications leaders with Beta between 0.8 and 1.4",
        "High Growth": "High-volatility growth sectors, recent IPOs, or AI startups (Beta >= 1.4, private tech firms)",
        "ETF": "Exchange-Traded Funds"
    },
    MarketCapTier: {
        "Mega-cap": "Valuation of $200B+ USD",
        "Large-cap": "Valuation of $10B - $200B USD",
        "Mid-cap": "Valuation of $2B - $10B USD",
        "Small-cap": "Valuation of $300M - $2B USD",
        "Micro-cap": "Valuation under $300M USD"
    }
};

// DOM Elements
const searchInput = document.getElementById('search');
const countrySelect = document.getElementById('filter-country');
const riskLevelSelect = document.getElementById('filter-risk-level');
const riskLabelSelect = document.getElementById('filter-risk-label');
const sectorSelect = document.getElementById('filter-sector');
const industrySelect = document.getElementById('filter-industry');
const marketCapSelect = document.getElementById('filter-market-cap');
const aiChainSelect = document.getElementById('filter-ai-chain');
const groupSelect = document.getElementById('filter-group-list');
const resetBtn = document.getElementById('reset-filters');

let forceCardView = false;

const cardGrid = document.getElementById('card-grid');
const groupedView = document.getElementById('grouped-view');
const noResults = document.getElementById('no-results');
const totalCount = document.getElementById('total-count');
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebar = document.querySelector('.sidebar');

// Initialize Dashboard
function init() {
    try {
        unreleasedDRs = new Set(); // Make all DRs clickable
        drData = rawDrData.map(item => {
            if (!item.Market_Cap_Tier || item.Market_Cap_Tier === 'N/A') {
                item.Market_Cap_Tier = 'ETF';
            }
            return item;
        });
        filteredData = [...drData];
        
        populateDropdowns();
        renderNewDRsCarousel();
        
        // Ensure sidebar is collapsed on default page load
        sidebar.classList.add('collapsed');
        
        applyFilters();
        setupEventListeners();

        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            sidebarToggle.classList.toggle('menu-open');
        });
    } catch (error) {
        console.error('Error loading data:', error);
        cardGrid.innerHTML = '<p style="color:red">Failed to load data.</p>';
    }
}

// Populate dropdowns with unique sorted values
function populateDropdowns() {
    const getUnique = (key) => {
        let uniqueVals = [...new Set(drData.map(item => item[key]))].filter(val => val !== 'N/A' && val !== null).sort();
        if (key === 'Market_Cap_Tier') {
            const tierOrder = ["Small-cap", "Mid-cap", "Large-cap", "Mega-cap"];
            uniqueVals.sort((a, b) => {
                let idxA = tierOrder.indexOf(a);
                let idxB = tierOrder.indexOf(b);
                if (idxA === -1) idxA = 99;
                if (idxB === -1) idxB = 99;
                return idxA - idxB;
            });
        }
        return uniqueVals;
    };
    
    const populate = (selectElement, values) => {
        values.forEach(val => {
            const option = document.createElement('option');
            option.value = val;
            option.textContent = val;
            selectElement.appendChild(option);
        });
    };

    populate(countrySelect, getUnique('Country'));
    populate(riskLevelSelect, getUnique('Risk_Level'));
    populate(riskLabelSelect, getUnique('Risk_Label'));
    populate(sectorSelect, getUnique('Sector'));
    populate(industrySelect, getUnique('Industry'));
    populate(marketCapSelect, getUnique('Market_Cap_Tier'));
    populate(aiChainSelect, getUnique('AI_Chain'));
    populate(groupSelect, getUnique('Stock_Group'));
}

// Setup Event Listeners
function setupEventListeners() {
    const filters = [
        searchInput, countrySelect, riskLevelSelect, riskLabelSelect, 
        sectorSelect, industrySelect, marketCapSelect, aiChainSelect, groupSelect
    ];
    
    filters.forEach(filter => {
        filter.addEventListener('input', () => {
            forceCardView = false;
            applyFilters();
        });
    });

    const heroSearch = document.getElementById('hero-search');
    if (heroSearch) {
        heroSearch.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                searchInput.value = e.target.value;
                forceCardView = false;
                applyFilters();
            }
        });
    }

    resetBtn.addEventListener('click', () => {
        forceCardView = false;
        filters.forEach(filter => filter.value = filter.id === 'search' ? '' : 'All');
        if (heroSearch) heroSearch.value = '';
        applyFilters();
    });

    // Recalculate dynamic grid counts on resize
    window.addEventListener('resize', applyFilters);
    
    // Update hero stat total DRs
    const heroStatDrs = document.getElementById('hero-stat-drs');
    if (heroStatDrs) {
        heroStatDrs.textContent = drData.length;
    }
}

// Apply Filters
function applyFilters() {
    // Trigger incoming zoom animation globally
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.classList.remove('animate-zoom');
        void mainContent.offsetWidth; // Trigger reflow
        mainContent.classList.add('animate-zoom');
    }

    const searchTerm = searchInput.value.toLowerCase();
    const country = countrySelect.value;
    const riskLevel = riskLevelSelect.value;
    const riskLabel = riskLabelSelect.value;
    const sector = sectorSelect.value;
    const industry = industrySelect.value;
    const marketCap = marketCapSelect.value;
    const aiChain = aiChainSelect.value;
    const group = groupSelect.value;

    filteredData = drData.filter(item => {
        const matchSearch = item.DR_Name.toLowerCase().includes(searchTerm) || 
                            item.Underlying.toLowerCase().includes(searchTerm);
        const matchCountry = country === 'All' || item.Country === country;
        const matchRiskLevel = riskLevel === 'All' || item.Risk_Level === riskLevel;
        const matchRiskLabel = riskLabel === 'All' || item.Risk_Label === riskLabel;
        const matchSector = sector === 'All' || item.Sector === sector;
        const matchIndustry = industry === 'All' || item.Industry === industry;
        const matchMarketCap = marketCap === 'All' || item.Market_Cap_Tier === marketCap;
        const matchAiChain = aiChain === 'All' || item.AI_Chain === aiChain;
        const matchGroup = group === 'All' || item.Stock_Group === group;

        return matchSearch && matchCountry && matchRiskLevel && matchRiskLabel && matchSector && 
               matchIndustry && matchMarketCap && matchAiChain && matchGroup;
    });

    let criteriaHtml = '';
    if (riskLevel !== 'All' && criteriaInfo.RiskLevel[riskLevel]) {
        criteriaHtml += `<div><strong>Risk Level (${riskLevel}):</strong> ${criteriaInfo.RiskLevel[riskLevel]}</div>`;
    }
    if (riskLabel !== 'All' && criteriaInfo.RiskLabel[riskLabel]) {
        criteriaHtml += `<div><strong>Risk Label (${riskLabel}):</strong> ${criteriaInfo.RiskLabel[riskLabel]}</div>`;
    }
    if (marketCap !== 'All' && criteriaInfo.MarketCapTier[marketCap]) {
        criteriaHtml += `<div><strong>Market Cap Tier (${marketCap}):</strong> ${criteriaInfo.MarketCapTier[marketCap]}</div>`;
    }

    const criteriaBox = document.getElementById('filter-criteria');
    if (criteriaHtml !== '') {
        criteriaBox.innerHTML = criteriaHtml;
        criteriaBox.classList.remove('hidden');
    } else {
        criteriaBox.innerHTML = '';
        criteriaBox.classList.add('hidden');
    }

    const isDefault = (
        searchTerm === '' && country === 'All' && riskLevel === 'All' && 
        riskLabel === 'All' && sector === 'All' && industry === 'All' && marketCap === 'All' && 
        aiChain === 'All' && group === 'All'
    );

    const isOnlyCountry = (
        searchTerm === '' && country !== 'All' && riskLevel === 'All' && 
        riskLabel === 'All' && sector === 'All' && industry === 'All' && marketCap === 'All' && 
        aiChain === 'All' && group === 'All'
    );

    const isCountryAndMarketCap = (
        searchTerm === '' && country !== 'All' && riskLevel === 'All' && 
        riskLabel === 'All' && sector === 'All' && industry === 'All' && marketCap !== 'All' && 
        aiChain === 'All' && group === 'All'
    );

    const isCountryAndMarketCapAndSector = (
        searchTerm === '' && country !== 'All' && riskLevel === 'All' && 
        riskLabel === 'All' && sector !== 'All' && industry === 'All' && marketCap !== 'All' && 
        aiChain === 'All' && group === 'All'
    );

    const shouldShortCircuit = filteredData.length <= 1;
    const heroSection = document.getElementById('hero-section');

    if (forceCardView) {
        if (heroSection) heroSection.classList.add('hidden');
        groupedView.classList.add('hidden');
        cardGrid.classList.remove('hidden');
        noResults.classList.add('hidden');
        renderCards();
    } else if (isDefault && !shouldShortCircuit) {
        if (heroSection) heroSection.classList.remove('hidden');
        groupedView.classList.remove('hidden');
        cardGrid.classList.add('hidden');
        noResults.classList.add('hidden');
        renderGroupedView('Country', drData);
        
        // Append View All button at the bottom of the default view
        const viewAllContainer = document.createElement('div');
        viewAllContainer.style.gridColumn = '1 / -1';
        viewAllContainer.innerHTML = `
            <div style="text-align: center; padding: 1rem 0; margin-top: 0.5rem;">
                <button class="btn-secondary" id="view-all-btn">
                    View All DRs
                </button>
            </div>
        `;
        groupedView.appendChild(viewAllContainer);
        
        document.getElementById('view-all-btn').addEventListener('click', () => {
            forceCardView = true;
            applyFilters();
        });
    } else if (isOnlyCountry && !shouldShortCircuit) {
        if (heroSection) heroSection.classList.add('hidden');
        groupedView.classList.remove('hidden');
        cardGrid.classList.add('hidden');
        noResults.classList.add('hidden');
        renderGroupedView('Market_Cap_Tier', filteredData);
    } else if (isCountryAndMarketCap && !shouldShortCircuit) {
        if (heroSection) heroSection.classList.add('hidden');
        groupedView.classList.remove('hidden');
        cardGrid.classList.add('hidden');
        noResults.classList.add('hidden');
        renderGroupedView('Sector', filteredData);
    } else if (isCountryAndMarketCapAndSector && !shouldShortCircuit) {
        if (heroSection) heroSection.classList.add('hidden');
        groupedView.classList.remove('hidden');
        cardGrid.classList.add('hidden');
        noResults.classList.add('hidden');
        renderGroupedView('Industry', filteredData);
    } else {
        if (heroSection) heroSection.classList.add('hidden');
        groupedView.classList.add('hidden');
        cardGrid.classList.remove('hidden');
        renderCards();
    }
}

// Render Cards to Grid
function renderCards() {
    cardGrid.innerHTML = '';
    totalCount.textContent = filteredData.length;

    if (filteredData.length === 0) {
        noResults.classList.remove('hidden');
        return;
    } else {
        noResults.classList.add('hidden');
    }

    filteredData.forEach(item => {
        const card = document.createElement('div');
        card.className = 'card';
        if (!unreleasedDRs.has(item.DR_Name)) {
            card.addEventListener('click', () => openDrModal(item));
            card.style.cursor = 'pointer';
        } else {
            card.style.cursor = 'default';
        }

        card.innerHTML = `
            <div class="card-header">
                <div class="card-symbol">${item.DR_Name}</div>
                <div class="card-name">${item.Underlying} (${item.Exchange})</div>
            </div>
            
            <div class="badges">
                <span class="badge badge-default">${item.Sector}</span>
            </div>

            <div class="card-data">
                <div class="data-item">
                    <span class="data-label">Market Cap</span>
                    <span class="data-value">${item.Market_Cap_Tier}</span>
                </div>
                <div class="data-item">
                    <span class="data-label">Conversion Ratio</span>
                    <span class="data-value highlight">${item.Conversion_Ratio}</span>
                </div>
                <div class="data-item">
                    <span class="data-label">Risk Level</span>
                    <span class="data-value">${item.Risk_Level}</span>
                </div>
                <div class="data-item">
                    <span class="data-label">AI Chain</span>
                    <span class="data-value">${item.AI_Chain}</span>
                </div>
            </div>
        `;
        cardGrid.appendChild(card);
    });
}

// Render Grouped View (By Country or Sector)
function renderGroupedView(groupByField, dataToGroup) {
    groupedView.innerHTML = '';
    totalCount.textContent = dataToGroup.length;

    const groups = {};
    dataToGroup.forEach(item => {
        let key = item[groupByField];
        if (!key || key === 'N/A') key = 'Other'; // Fallback for other fields if needed
        if (!groups[key]) {
            groups[key] = [];
        }
        groups[key].push(item);
    });

    let sortedKeys;
    if (groupByField === 'Country') {
        const desiredOrder = ["United States", "Hong Kong", "Japan", "China"];
        sortedKeys = Object.keys(groups).sort((a, b) => {
            let idxA = desiredOrder.indexOf(a);
            let idxB = desiredOrder.indexOf(b);
            if (idxA === -1) idxA = 99;
            if (idxB === -1) idxB = 99;
            return idxA - idxB;
        });
    } else if (groupByField === 'Market_Cap_Tier') {
        const desiredOrder = ["Mega-cap", "Large-cap", "Mid-cap", "Small-cap", "Micro-cap"];
        sortedKeys = Object.keys(groups).sort((a, b) => {
            let idxA = desiredOrder.indexOf(a);
            let idxB = desiredOrder.indexOf(b);
            if (idxA === -1) idxA = 99;
            if (idxB === -1) idxB = 99;
            return idxA - idxB;
        });
    } else {
        sortedKeys = Object.keys(groups).sort((a, b) => {
            return groups[b].length - groups[a].length;
        });
    }

    sortedKeys.forEach(groupKey => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'country-group'; // Reused for styles
        groupDiv.addEventListener('click', (e) => {
            const clickedPill = e.target.closest('.dr-pill');
            if (clickedPill) {
                const drName = clickedPill.querySelector('.dr-pill-symbol').textContent;
                if (!unreleasedDRs.has(drName)) {
                    e.stopPropagation();
                    const item = groups[groupKey].find(d => d.DR_Name === drName);
                    if (item) openDrModal(item);
                    return;
                } else {
                    e.stopPropagation();
                    return;
                }
            }

            // Outbound zoom-into animation
            groupDiv.style.transition = 'transform 0.15s ease-in, opacity 0.15s ease-in';
            groupDiv.style.transform = 'scale(1.05)';
            groupDiv.style.opacity = '0';
            groupDiv.style.zIndex = '100';
            groupDiv.style.pointerEvents = 'none';

            setTimeout(() => {
                if (groupByField === 'Country') {
                    countrySelect.value = groupKey;
                } else if (groupByField === 'Market_Cap_Tier') {
                    marketCapSelect.value = groupKey;
                    if (groupKey === 'ETF') {
                        forceCardView = true;
                    }
                } else if (groupByField === 'Sector') {
                    sectorSelect.value = groupKey;
                } else if (groupByField === 'Industry') {
                    industrySelect.value = groupKey;
                }
                applyFilters();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }, 150);
        });

        const mcScore = { "Mega-cap": 5, "Large-cap": 4, "Mid-cap": 3, "Small-cap": 2, "Micro-cap": 1 };
        groups[groupKey].sort((a, b) => {
            const scoreA = mcScore[a.Market_Cap_Tier] || 0;
            const scoreB = mcScore[b.Market_Cap_Tier] || 0;
            return scoreB - scoreA;
        });

        let displayLimit = 8;
        if (groupByField === 'Market_Cap_Tier' || groupByField === 'Sector' || groupByField === 'Industry') {
            // Measure actual rendered width to mathematically match CSS Grid's auto-fill exactly
            const containerWidth = groupedView.clientWidth || (window.innerWidth - 400); 
            const boxWidth = (containerWidth - 24) / 2; // Subtract 1.5rem (24px) grid gap
            const innerBoxWidth = boxWidth - 48; // Subtract 1.5rem padding on both sides (48px)
            
            // CSS is minmax(110px, 1fr) with 0.8rem (13px) gap
            // Formula matches CSS algorithm: N * 110 + (N-1) * 13 <= innerWidth
            displayLimit = Math.max(1, Math.floor((innerBoxWidth + 13) / 123));
        }
        const topPills = groups[groupKey].slice(0, displayLimit);
        let pillsHtml = '';
        topPills.forEach(item => {
            const isUnreleased = unreleasedDRs.has(item.DR_Name);
            const cursorStyle = isUnreleased ? 'cursor: default;' : 'cursor: pointer;';
            pillsHtml += `
                <div class="dr-pill" style="${cursorStyle}">
                    <div class="dr-pill-name" title="${item.Underlying}">${item.Underlying}</div>
                    <div class="dr-pill-symbol">${item.DR_Name}</div>
                </div>
            `;
        });

        const totalInGroup = groups[groupKey].length;
        const hiddenCount = totalInGroup - topPills.length;
        
        let viewMoreHtml = '';
        if (hiddenCount > 0) {
            viewMoreHtml = `
                <div class="view-more-text">
                    + ${hiddenCount} more ${groupKey} DRs &rarr;
                </div>
            `;
        } else {
            // Keep identical height by showing a status text
            viewMoreHtml = `
                <div class="view-more-text" style="opacity: 0.6;">
                    Showing all DRs
                </div>
            `;
        }

        groupDiv.innerHTML = `
            <div class="country-group-header">
                <span>${groupKey}</span>
                <span class="group-count-badge">${totalInGroup} DR${totalInGroup !== 1 ? 's' : ''}</span>
            </div>
            <div class="dr-pill-grid">
                ${pillsHtml}
            </div>
            ${viewMoreHtml}
        `;

        groupedView.appendChild(groupDiv);
    });
}

// =========================================
// Modal & TradingView Logic
// =========================================

const drModal = document.getElementById('dr-modal');
const modalClose = document.getElementById('modal-close');
const modalDrName = document.getElementById('modal-dr-name');
const modalUnderlyingName = document.getElementById('modal-underlying-name');
const modalGrid = document.getElementById('modal-categorization-grid');

// Nav Controls
const navHome = document.getElementById('nav-home');
const navBackLayer = document.getElementById('nav-back-layer');

// ----------------------------------------------------
// LIVE TICKER UPDATER
// ----------------------------------------------------
function loadLiveTickerData() {
    const script = document.createElement('script');
    script.src = '../live_ticker_data.js?t=' + new Date().getTime();
    script.onload = () => {
        if (window.LIVE_TICKER_DATA) {
            renderTicker(window.LIVE_TICKER_DATA.slice(0, 20));
            
            // Smoothly update open chart and performance grid without resetting zoom
            if (currentDrItem && currentLwSeries && !document.getElementById('dr-modal').classList.contains('hidden')) {
                let rawHistData = window.HISTORICAL_CHART_DATA[currentDrItem.Underlying_Ticker] || [];
                if (rawHistData.length > 0) {
                    let histCopy = JSON.parse(JSON.stringify(rawHistData));
                    let tickerBase = currentDrItem.Underlying_Ticker;
                    if (tickerBase.includes('.')) tickerBase = tickerBase.split('.')[0];
                    
                    const live = window.LIVE_TICKER_DATA.find(t => 
                        currentDrItem.Underlying_Ticker === t.symbol || 
                        currentDrItem.Underlying_Ticker.startsWith(t.symbol + ".") || 
                        t.symbol === tickerBase
                    );
                    
                    if (live) {
                        const last = histCopy[histCopy.length - 1];
                        last.close = live.price;
                        if (live.price > last.high) last.high = live.price;
                        if (live.price < last.low) last.low = live.price;
                        
                        // Current timeframe could be 1W, but we just update daily candle if it's 1D
                        if (currentChartTimeframe === '1D') {
                            currentLwSeries.update(last);
                        }
                    }
                    
                    // Always update performance grid which uses daily data
                    updatePerformanceGrid(histCopy);
                }
            }
        }
    };
    script.onerror = () => {
        console.log("Waiting for live ticker data...");
    };
    document.body.appendChild(script);
    
    setTimeout(() => { script.remove(); }, 2000);
}

function renderTicker(data) {
    let html = '';
    data.forEach(item => {
        const color = item.changePct >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
        const arrow = item.changePct >= 0 ? '▲' : '▼';
        html += `<span><strong style="color: white;">${item.symbol}</strong> <span style="color: ${color};">${arrow} ${Math.abs(item.changePct).toFixed(2)}%</span></span>`;
    });
    
    // Ensure the ticker is long enough to span ultra-wide monitors before it loops
    let fullHtml = html.repeat(6); 
    
    const container1 = document.getElementById('ticker-content-container');
    const container2 = document.getElementById('ticker-content-clone');
    
    if (container1 && container2) {
        container1.innerHTML = fullHtml;
        container2.innerHTML = fullHtml;
    }
}

function updatePerformanceGrid(histData) {
    const grid = document.getElementById('perf-indicator');
    if (!grid) return;
    
    if (!histData || histData.length === 0) {
        grid.innerHTML = '';
        return;
    }
    
    // histData is already sorted in renderChart, and live price is stitched into the last candle
    const latestClose = histData[histData.length - 1].close;
    
    const getPriceAtDate = (targetDate) => {
        let price = histData[0].close;
        for (let i = histData.length - 1; i >= 0; i--) {
            const d = new Date(histData[i].time);
            if (d <= targetDate) {
                price = histData[i].close;
                break;
            }
        }
        return price;
    };
    
    const getPerfHtml = (targetDate, label) => {
        const oldPrice = getPriceAtDate(targetDate);
        if (!oldPrice) return '';
        const change = ((latestClose - oldPrice) / oldPrice) * 100;
        const isPos = change >= 0;
        const color = isPos ? '#26a69a' : '#ef5350';
        const sign = change > 0 ? '+' : '';
        return `
            <div style="background: rgba(0, 0, 0, 0.5); color: ${color}; border: 1px solid rgba(255, 255, 255, 0.05); display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4px 0; border-radius: 3px; font-family: Inter, sans-serif;">
                <div style="font-size: 11px; font-weight: bold;">${sign}${change.toFixed(2)}%</div>
                <div style="font-size: 9px; opacity: 0.7;">${label}</div>
            </div>
        `;
    };
    
    const now = new Date();
    const d1W = new Date(now); d1W.setDate(d1W.getDate() - 7);
    const d1M = new Date(now); d1M.setMonth(d1M.getMonth() - 1);
    const d3M = new Date(now); d3M.setMonth(d3M.getMonth() - 3);
    const d6M = new Date(now); d6M.setMonth(d6M.getMonth() - 6);
    const d1Y = new Date(now); d1Y.setFullYear(d1Y.getFullYear() - 1);
    
    const dYTD = new Date(now);
    dYTD.setFullYear(dYTD.getFullYear() - 1);
    dYTD.setMonth(11, 31);
    dYTD.setHours(23, 59, 59, 999);
    
    grid.innerHTML = `
        <div style="grid-column: span 3; font-size: 10px; color: rgba(255,255,255,0.5); text-align: center; margin-bottom: 2px; letter-spacing: 0.5px;">UNDERLYING PERF.</div>
        ${getPerfHtml(d1W, '1W')}
        ${getPerfHtml(d1M, '1M')}
        ${getPerfHtml(d3M, '3M')}
        ${getPerfHtml(d6M, '6M')}
        ${getPerfHtml(dYTD, 'YTD')}
        ${getPerfHtml(d1Y, '1Y')}
    `;
}

// ----------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    loadLiveTickerData();
    setInterval(loadLiveTickerData, 15000); // Check every 15s
});

if (navHome) {
    navHome.addEventListener('click', () => {
        // Reset all filters to return to default layer, and smoothly scroll to the top
        resetBtn.click();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

const logoHome = document.getElementById('logo-home');
if (logoHome) {
    logoHome.addEventListener('click', () => {
        if (navHome) navHome.click();
    });
}

if (navBackLayer) {
    navBackLayer.addEventListener('click', () => {
        // If modal is open, layer back = close modal
        if (!drModal.classList.contains('hidden')) {
            closeDrModal();
            return;
        }
        
        // If viewing all cards, layer back = go back to grouped view
        if (forceCardView) {
            forceCardView = false;
            // If we bypassed Sector/Industry because of ETF, step back all the way to Country view
            if (marketCapSelect.value === 'ETF') {
                marketCapSelect.value = 'All';
            }
        } 
        // Otherwise step up the drill-down hierarchy
        else if (industrySelect.value !== 'All') {
            industrySelect.value = 'All';
        } else if (sectorSelect.value !== 'All') {
            sectorSelect.value = 'All';
        } else if (marketCapSelect.value !== 'All') {
            marketCapSelect.value = 'All';
        } else if (countrySelect.value !== 'All') {
            countrySelect.value = 'All';
        } else if (searchInput.value !== '') {
            searchInput.value = '';
        } else if (riskLevelSelect.value !== 'All' || riskLabelSelect.value !== 'All' || aiChainSelect.value !== 'All' || groupSelect.value !== 'All') {
            riskLevelSelect.value = 'All';
            riskLabelSelect.value = 'All';
            aiChainSelect.value = 'All';
            groupSelect.value = 'All';
        } else {
            // In default page, do nothing!
            return; 
        }
        
        applyFilters();
    });
}

let currentDrItem = null;

modalClose.addEventListener('click', closeDrModal);
drModal.addEventListener('click', (e) => {
    if (e.target === drModal) closeDrModal();
});

function openDrModal(item) {
    currentDrItem = item;
    
    // Header
    modalDrName.textContent = item.DR_Name;
    modalUnderlyingName.textContent = `${item.Underlying} (${item.Exchange})`;
    
    const currLabel = document.getElementById('chart-currency-label');
    if (currLabel) {
        currLabel.textContent = ''; // Removed per user request
    }
    
    // Reset Checkboxes
    const cbUnderlying = document.getElementById('toggle-underlying');
    const cbDr = document.getElementById('toggle-dr');
    if (cbUnderlying) cbUnderlying.checked = true;
    if (cbDr) cbDr.checked = true;
    
    // Categorization Grid
    modalGrid.innerHTML = '';
    
    // Extract all properties from the item object except the raw underlying ticker if we want to display it neatly.
    // We'll just display all keys that have a value.
    const keysToExclude = ['Underlying_Ticker']; 
    
    for (const [key, value] of Object.entries(item)) {
        if (keysToExclude.includes(key)) continue;
        
        const label = key.replace(/_/g, ' ');
        const displayValue = (value === null || value === '' || value === 'N/A') ? '-' : value;
        
        const catItem = document.createElement('div');
        catItem.className = 'cat-item';
        catItem.innerHTML = `
            <div class="cat-label">${label}</div>
            <div class="cat-value">${displayValue}</div>
        `;
        modalGrid.appendChild(catItem);
    }
    
    // Show Modal
    drModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
    
    // Initialize Chart after modal is visible
    setTimeout(renderChart, 10);
}

function closeDrModal() {
    drModal.classList.add('hidden');
    document.body.style.overflow = '';
    if (currentLwChart) {
        currentLwChart.remove();
        currentLwChart = null;
    }
    document.getElementById('tv-chart-container').innerHTML = '';
}

function renderChart() {
    try {
        if (!currentDrItem) return;
        
        const containerId = 'tv-chart-container';
        const container = document.getElementById(containerId);
        
        if (currentLwChart) {
            currentLwChart.remove();
            currentLwChart = null;
        }
        container.innerHTML = '<div id="perf-indicator" style="position: absolute; top: 75px; left: 70px; z-index: 10; display: grid; grid-template-columns: repeat(3, 55px); gap: 3px; pointer-events: none;"></div>';
        
        let rawTicker = currentDrItem.Underlying_Ticker;
        
        // Get historical data
        let histData = [];
        if (window.HISTORICAL_CHART_DATA && window.HISTORICAL_CHART_DATA[rawTicker]) {
            // Deep copy so we can modify the last candle safely
            histData = JSON.parse(JSON.stringify(window.HISTORICAL_CHART_DATA[rawTicker]));
            
            // Deduplicate and sort by time (Lightweight Charts requires strictly ascending time)
            const uniqueData = [];
            const seenTimes = new Set();
            for (const item of histData) {
                if (!seenTimes.has(item.time)) {
                    seenTimes.add(item.time);
                    uniqueData.push(item);
                }
            }
            histData = uniqueData.sort((a, b) => new Date(a.time) - new Date(b.time));
        }
        
        // Stitch Live Data if available
        if (window.LIVE_TICKER_DATA && histData.length > 0) {
            let tickerBase = rawTicker;
            if (tickerBase.includes('.')) tickerBase = tickerBase.split('.')[0];
            
            const livePriceObj = window.LIVE_TICKER_DATA.find(t => 
                rawTicker === t.symbol || 
                rawTicker.startsWith(t.symbol + ".") || 
                t.symbol === tickerBase
            );
            
            if (livePriceObj) {
                const lastCandle = histData[histData.length - 1];
                const livePrice = livePriceObj.price;
                
                lastCandle.close = livePrice;
                if (livePrice > lastCandle.high) lastCandle.high = livePrice;
                if (livePrice < lastCandle.low) lastCandle.low = livePrice;
            }
        }
        
        updatePerformanceGrid(histData);
        
        if (currentChartTimeframe === '1W' && histData.length > 0) {
            const weeklyMap = {};
            const orderedWeeks = [];
            
            for (const item of histData) {
                const d = new Date(item.time);
                const day = d.getDay();
                const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
                const monday = new Date(d.setDate(diff));
                const week = monday.toISOString().split('T')[0];
                
                if (!weeklyMap[week]) {
                    weeklyMap[week] = {
                        time: week,
                        open: item.open,
                        high: item.high,
                        low: item.low,
                        close: item.close,
                        volume: item.volume
                    };
                    orderedWeeks.push(week);
                } else {
                    const w = weeklyMap[week];
                    w.high = Math.max(w.high, item.high);
                    w.low = Math.min(w.low, item.low);
                    w.close = item.close;
                    if (item.volume) w.volume += item.volume;
                }
            }
            histData = orderedWeeks.map(w => weeklyMap[w]);
        }
        
        let drDataLine = [];
        const ccy = getCurrency(currentDrItem.Country, currentDrItem.Exchange);
        const convRatio = currentDrItem.Conversion_Ratio;
        
        if (ccy && convRatio && window.FX_CHART_DATA) {
            for (const item of histData) {
                const d = new Date(item.time);
                const dateStr = d.toISOString().split('T')[0];
                
                const fxRate = getTMinus1FXRate(ccy, dateStr);
                const drPrice = calculateDRPrice(item.close, fxRate, convRatio);
                
                if (drPrice) {
                    drDataLine.push({
                        time: item.time,
                        value: drPrice
                    });
                }
            }
        }

        const chartOptions = {
            width: container.clientWidth,
            height: container.clientHeight || 500,
            layout: {
                textColor: '#d1d4dc',
                background: { type: 'solid', color: 'transparent' }
            },
            grid: {
                vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
                horzLines: { color: 'rgba(255, 255, 255, 0.05)' }
            },
            timeScale: {
                borderColor: 'rgba(255, 255, 255, 0.1)',
                timeVisible: false,
            },
            rightPriceScale: {
                borderColor: 'rgba(255, 255, 255, 0.1)',
                visible: true,
            },
            leftPriceScale: {
                borderColor: 'rgba(255, 255, 255, 0.1)',
                visible: true,
            }
        };
        
        currentLwChart = LightweightCharts.createChart(container, chartOptions);
        
        if (currentChartType === 'candle') {
            currentLwSeries = currentLwChart.addCandlestickSeries({
                upColor: '#26a69a',
                downColor: '#ef5350',
                borderVisible: false,
                wickUpColor: '#26a69a',
                wickDownColor: '#ef5350',
                priceScaleId: 'right'
            });
        } else {
            currentLwSeries = currentLwChart.addLineSeries({
                color: '#FFFFFF', // White for underlying line
                lineWidth: 2,
                priceScaleId: 'right'
            });
            
            // Convert OHLC to line data
            histData = histData.map(d => ({ time: d.time, value: d.close }));
        }
        
        drSeries = null;
        if (drDataLine.length > 0) {
            drSeries = currentLwChart.addLineSeries({
                color: '#855AFF', // InnovestX Purple
                lineWidth: 2,
                priceScaleId: 'left'
            });
        }
        
        if (histData.length > 0) {
            currentLwSeries.setData(histData);
            if (drSeries) drSeries.setData(drDataLine);
            
            // Add legend
            const oldLegend = document.getElementById('chart-legend');
            if (oldLegend) oldLegend.remove();
            
            container.style.position = 'relative';
            const legend = document.createElement('div');
            legend.id = 'chart-legend';
            legend.style.position = 'absolute';
            legend.style.left = '70px'; // Moved right to clear the left Y-axis
            legend.style.top = '12px';
            legend.style.zIndex = 10;
            legend.style.fontSize = '12px';
            legend.style.fontFamily = 'Inter, sans-serif';
            legend.style.color = '#d1d4dc';
            legend.style.pointerEvents = 'none';
            legend.style.background = 'rgba(0, 0, 0, 0.5)';
            legend.style.padding = '8px';
            legend.style.borderRadius = '4px';
            legend.style.border = '1px solid rgba(255, 255, 255, 0.1)';
            
            let legendHtml = '';
            if (currentChartType === 'candle') {
                legendHtml = `
                    <div style="margin-bottom: 4px; display: flex; align-items: center;">
                        <span style="display:inline-block; width:12px; height:12px; background:linear-gradient(to right, #26a69a 50%, #ef5350 50%); margin-right:6px; border-radius:2px;"></span>
                        <span>Underlying (${ccy}) - Right Axis</span>
                    </div>
                    <div style="display: flex; align-items: center;">
                        <span style="display:inline-block; width:12px; height:2px; background:#855AFF; margin-right:6px;"></span>
                        <span>Est. DR Price (THB) - Left Axis</span>
                    </div>
                `;
            } else {
                legendHtml = `
                    <div style="margin-bottom: 4px; display: flex; align-items: center;">
                        <span style="display:inline-block; width:12px; height:2px; background:#FFFFFF; margin-right:6px;"></span>
                        <span>Underlying (${ccy}) - Right Axis</span>
                    </div>
                    <div style="display: flex; align-items: center;">
                        <span style="display:inline-block; width:12px; height:2px; background:#855AFF; margin-right:6px;"></span>
                        <span>Est. DR Price (THB) - Left Axis</span>
                    </div>
                `;
            }
            legend.innerHTML = legendHtml;
            container.appendChild(legend);
            
            if (currentChartTimeframe === '1D') {
                const visibleCount = Math.min(126, histData.length);
                currentLwChart.timeScale().setVisibleLogicalRange({
                    from: histData.length - visibleCount,
                    to: histData.length - 1
                });
            } else {
                currentLwChart.timeScale().fitContent();
            }
        } else {
            container.innerHTML = '<div style="display:flex; justify-content:center; align-items:center; height:100%; color:#888;">No historical data available</div>';
        }
    } catch (e) {
        document.getElementById('tv-chart-container').innerHTML = `<div style="color:red; padding: 20px;">Error rendering chart: ${e.message}<br><pre>${e.stack}</pre></div>`;
    }
}

// Start app
init();

// Chart Listeners
document.getElementById('chart-btn-1d')?.addEventListener('click', (e) => {
    if (currentChartTimeframe === '1D') return;
    currentChartTimeframe = '1D';
    e.target.classList.add('active');
    e.target.style.background = 'rgba(133, 90, 255, 0.2)';
    e.target.style.borderColor = 'rgba(133, 90, 255, 0.5)';
    
    const wBtn = document.getElementById('chart-btn-1w');
    wBtn.classList.remove('active');
    wBtn.style.background = 'rgba(255, 255, 255, 0.05)';
    wBtn.style.borderColor = 'rgba(255, 255, 255, 0.1)';
    
    renderChart();
});

document.getElementById('chart-btn-1w')?.addEventListener('click', (e) => {
    if (currentChartTimeframe === '1W') return;
    currentChartTimeframe = '1W';
    e.target.classList.add('active');
    e.target.style.background = 'rgba(133, 90, 255, 0.2)';
    e.target.style.borderColor = 'rgba(133, 90, 255, 0.5)';
    
    const dBtn = document.getElementById('chart-btn-1d');
    dBtn.classList.remove('active');
    dBtn.style.background = 'rgba(255, 255, 255, 0.05)';
    dBtn.style.borderColor = 'rgba(255, 255, 255, 0.1)';
    
    renderChart();
});

document.getElementById('chart-btn-candle')?.addEventListener('click', (e) => {
    if (currentChartType === 'candle') return;
    currentChartType = 'candle';
    e.target.classList.add('active');
    e.target.style.background = 'rgba(133, 90, 255, 0.2)';
    e.target.style.borderColor = 'rgba(133, 90, 255, 0.5)';
    
    const lineBtn = document.getElementById('chart-btn-line');
    lineBtn.classList.remove('active');
    lineBtn.style.background = 'rgba(255, 255, 255, 0.05)';
    lineBtn.style.borderColor = 'rgba(255, 255, 255, 0.1)';
    
    renderChart();
});

document.getElementById('chart-btn-line')?.addEventListener('click', (e) => {
    if (currentChartType === 'line') return;
    currentChartType = 'line';
    e.target.classList.add('active');
    e.target.style.background = 'rgba(133, 90, 255, 0.2)';
    e.target.style.borderColor = 'rgba(133, 90, 255, 0.5)';
    
    const candleBtn = document.getElementById('chart-btn-candle');
    candleBtn.classList.remove('active');
    candleBtn.style.background = 'rgba(255, 255, 255, 0.05)';
    candleBtn.style.borderColor = 'rgba(255, 255, 255, 0.1)';
    
    renderChart();
});

document.getElementById('toggle-underlying')?.addEventListener('change', (e) => {
    if (currentLwSeries) {
        currentLwSeries.applyOptions({ visible: e.target.checked });
    }
});

document.getElementById('toggle-dr')?.addEventListener('change', (e) => {
    if (drSeries) {
        drSeries.applyOptions({ visible: e.target.checked });
    }
});

window.addEventListener('resize', () => {
    if (currentLwChart) {
        const container = document.getElementById('tv-chart-container');
        currentLwChart.applyOptions({ width: container.clientWidth });
    }
});

// Render New DRs Carousel
document.getElementById("carousel-left")?.addEventListener("click", () => {
    const carousel = document.getElementById("new-drs-carousel");
    const gap = 24; // 1.5rem gap
    const cardWidth = carousel.firstElementChild.offsetWidth;
    const scrollAmount = cardWidth + gap;
    
    // Move last to first silently
    carousel.prepend(carousel.lastElementChild);
    carousel.scrollBy({ left: scrollAmount, behavior: "instant" });
    
    // Then animate
    setTimeout(() => {
        carousel.scrollBy({ left: -scrollAmount, behavior: "smooth" });
    }, 20);
});

document.getElementById("carousel-right")?.addEventListener("click", () => {
    const carousel = document.getElementById("new-drs-carousel");
    const gap = 24; // 1.5rem gap
    const cardWidth = carousel.firstElementChild.offsetWidth;
    const scrollAmount = cardWidth + gap;
    
    carousel.scrollBy({ left: scrollAmount, behavior: "smooth" });
    
    setTimeout(() => {
        carousel.append(carousel.firstElementChild);
        carousel.scrollBy({ left: -scrollAmount, behavior: "instant" });
    }, 400);
});

// Handle native trackpad/wheel infinite scrolling
const newDrsCarousel = document.getElementById("new-drs-carousel");
if (newDrsCarousel) {
    let isAdjusting = false;
    newDrsCarousel.addEventListener("scroll", () => {
        if (isAdjusting) return;
        
        const gap = 24;
        const cardWidth = newDrsCarousel.firstElementChild.offsetWidth;
        const itemWidth = cardWidth + gap;
        
        if (newDrsCarousel.scrollLeft <= 0) {
            isAdjusting = true;
            newDrsCarousel.prepend(newDrsCarousel.lastElementChild);
            newDrsCarousel.scrollLeft += itemWidth;
            // Short timeout to prevent double-firing during inertia bounce
            setTimeout(() => isAdjusting = false, 50);
        } else if (newDrsCarousel.scrollLeft + newDrsCarousel.clientWidth >= newDrsCarousel.scrollWidth - 1) {
            isAdjusting = true;
            newDrsCarousel.append(newDrsCarousel.firstElementChild);
            newDrsCarousel.scrollLeft -= itemWidth;
            setTimeout(() => isAdjusting = false, 50);
        }
    });
}

function renderNewDRsCarousel() {
    const carousel = document.getElementById("new-drs-carousel");
    if (!carousel) return;
    
    // Get the last 19 items from drData
    const newDrs = drData.slice(-19);
    
    newDrs.forEach(item => {
        const card = document.createElement("div");
        card.className = "card";
        card.addEventListener("click", () => openDrModal(item));
        card.style.cursor = "pointer";
        
        // Add a "Coming Soon" badge at the top
        card.innerHTML = `
            <div style="background: var(--accent-primary); color: white; text-align: center; font-size: 0.85rem; font-weight: 600; padding: 0.4rem; border-radius: 12px 12px 0 0; margin: -1.5rem -1.5rem 1rem -1.5rem;">
                Coming Soon
            </div>
            <div class="card-header">
                <div class="card-symbol">${item.DR_Name}</div>
                <div class="card-name">${item.Underlying} (${item.Exchange})</div>
            </div>
            
            <div class="badges">
                <span class="badge badge-default">${item.Sector}</span>
            </div>

            <div class="card-data">
                <div class="data-item">
                    <span class="data-label">Market Cap</span>
                    <span class="data-value">${item.Market_Cap_Tier}</span>
                </div>
                <div class="data-item">
                    <span class="data-label">Conversion Ratio</span>
                    <span class="data-value highlight">${item.Conversion_Ratio}</span>
                </div>
                <div class="data-item">
                    <span class="data-label">Risk Level</span>
                    <span class="data-value">${item.Risk_Level}</span>
                </div>
                <div class="data-item">
                    <span class="data-label">AI Chain</span>
                    <span class="data-value">${item.AI_Chain}</span>
                </div>
            </div>
        `;
        carousel.appendChild(card);
    });
    
    // Auto-center the carousel on load
    const centerCarousel = () => {
        const cards = carousel.querySelectorAll('.card');
        if (cards.length > 0) {
            // Find the NOW23 card exactly as requested, fallback to mathematical center
            let targetIndex = Array.from(cards).findIndex(card => card.innerHTML.includes('NOW23'));
            if (targetIndex === -1) targetIndex = Math.floor(cards.length / 2);
            
            const targetCard = cards[targetIndex];
            
            // Wait for the browser to physically compute the flex layout coordinates
            if (targetCard && targetCard.offsetLeft > 0 && carousel.clientWidth > 0) {
                const scrollPos = targetCard.offsetLeft - (carousel.clientWidth / 2) + (targetCard.offsetWidth / 2);
                carousel.scrollLeft = scrollPos;
                return;
            }
        }
        
        // Keep retrying until layout is computed (runs very fast in the background)
        setTimeout(centerCarousel, 50);
    };
    
    centerCarousel();
}




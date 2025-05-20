// Variables globales
let isRunning = false;
let chart;
let simulationInterval;
let lastAnalogTemp = 0;
let lastDigitalTemp = 0;
let maxDataPoints = parseInt(document.getElementById('sampleCount')?.value) || 100;

// Inicialización al cargar la página
document.addEventListener('DOMContentLoaded', function () {
    initializeChart();
    setupEventListeners();
    updateClock();
    addLogEntry("Sistema de calibración listo", "success");
});

// Configurar event listeners
function setupEventListeners() {
    document.getElementById('startStopBtn').addEventListener('click', toggleConnection);
    document.getElementById('exportBtn').addEventListener('click', exportData);
    document.getElementById('clearConsoleBtn').addEventListener('click', clearConsole);
    document.getElementById('lowRef').addEventListener('input', updateAnnotationLines);
    document.getElementById('highRef').addEventListener('input', updateAnnotationLines);
    document.getElementById('sampleCount').addEventListener('input', () => {
    const newValue = parseInt(document.getElementById('sampleCount').value);
    if (!isNaN(newValue) && newValue > 0) {
            maxDataPoints = newValue;
            addLogEntry(`Número de muestras visibles actualizado a ${maxDataPoints}`, "info");
        }
    });
}

// Reloj en tiempo real
function updateClock() {
    function updateTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString();
        document.getElementById('clock').textContent = timeString;
    }
    updateTime();
    setInterval(updateTime, 1000);
}

// Inicializar gráfico
function initializeChart() {
    const ctx = document.getElementById('temperatureChart').getContext('2d');

    if (typeof ChartDataLabels !== 'undefined') Chart.register(ChartDataLabels);
    if (typeof ChartAnnotation !== 'undefined') Chart.register(ChartAnnotation);

    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Sensor Analógico',
                    data: [],
                    borderColor: '#00B4D8',
                    backgroundColor: 'rgba(0, 180, 216, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 0
                },
                {
                    label: 'Sensor Digital (Referencia)',
                    data: [],
                    borderColor: '#FFD700',
                    backgroundColor: 'rgba(255, 215, 0, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#8B98A5' }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Temperatura (°C)',
                        color: '#8B98A5'
                    },
                    min: -10,
                    max: 110,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#8B98A5' }
                }
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#E6F1F7',
                        font: { family: "'Rajdhani', sans-serif" },
                        filter: item => item.datasetIndex < 2
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(30, 30, 30, 0.9)',
                    titleColor: '#00B4D8',
                    bodyColor: '#E6F1F7',
                    borderColor: '#0077B6',
                    borderWidth: 1,
                    filter: tooltipItem => tooltipItem.datasetIndex < 2
                },
                datalabels: {
                    display: false
                },
                annotation: {
                    annotations: {
                        boiling: {
                            type: 'line',
                            yMin: 100,
                            yMax: 100,
                            borderColor: '#8b0000',
                            borderWidth: 2,
                            label: {
                                content: 'Temp. ebullición (100°C)',
                                enabled: true,
                                position: 'end',
                                backgroundColor: '#8b0000',
                                color: '#fff',
                                font: { size: 12, family: 'Rajdhani' }
                            }
                        },
                        freezing: {
                            type: 'line',
                            yMin: 0,
                            yMax: 0,
                            borderColor: '#2f2c79',
                            borderWidth: 2,
                            label: {
                                content: 'Temp. fusión (0°C)',
                                enabled: true,
                                position: 'end',
                                backgroundColor: '#2f2c79',
                                color: '#fff',
                                font: { size: 12, family: 'Rajdhani' }
                            }
                        }
                    }
                }
            },
            animation: {
                duration: 1000,
                easing: 'easeOutQuart'
            }
        }
    });

    updateAnnotationLines();
    chart.update();
}

function updateAnnotationLines() {
    const annotations = chart?.options?.plugins?.annotation?.annotations;
    if (!annotations || !annotations.boiling || !annotations.freezing) return;

    const boiling = parseFloat(document.getElementById('highRef').value) || 100;
    const freezing = parseFloat(document.getElementById('lowRef').value) || 0;

    annotations.boiling.yMin = boiling;
    annotations.boiling.yMax = boiling;
    annotations.boiling.label.content = `Temp. ebullición (${boiling}°C)`;

    annotations.freezing.yMin = freezing;
    annotations.freezing.yMax = freezing;
    annotations.freezing.label.content = `Temp. fusión (${freezing}°C)`;

    chart.update();
}

// Conexión real con Arduino
function toggleConnection() {
    const button = document.getElementById('startStopBtn');

    if (isRunning) {
        fetch('/api/disconnect', { method: 'POST' }).then(() => {
            clearInterval(simulationInterval);
            isRunning = false;
            button.textContent = 'Conectar';
            button.classList.remove('active');
            addLogEntry("Desconectado del Arduino", "info");
        });
    } else {
        fetch('/api/connect', { method: 'POST' })
            .then(res => res.json())
            .then(data => {
                if (data.status === "connected") {
                    button.textContent = 'Desconectar';
                    button.classList.add('active');
                    addLogEntry("Conectado al Arduino", "success");
                    simulationInterval = setInterval(fetchSensorData, 1000);
                    isRunning = true;
                } else {
                    addLogEntry("Fallo al conectar al Arduino", "error");
                }
            });
    }
}

// Obtener datos reales desde la API
function fetchSensorData() {
    fetch('/api/data')
        .then(res => res.json())
        .then(data => {
            const digitalTemp = data.digitalTemp || 0;
            const analogTemp = data.analogTemp || 0;
            const difference = Math.abs(analogTemp - digitalTemp);

            lastDigitalTemp = digitalTemp;
            lastAnalogTemp = analogTemp;

            updateDisplay(digitalTemp, analogTemp, difference);
            updateChart(digitalTemp, analogTemp);
        })
        .catch(err => {
            console.error("Error al obtener datos:", err);
            addLogEntry("Error al obtener datos del Arduino", "error");
        });
}

// Actualizar visualización
function updateDisplay(digitalTemp, analogTemp, difference) {
    document.getElementById('digitalValue').textContent = digitalTemp.toFixed(1);
    document.getElementById('analogValue').textContent = analogTemp.toFixed(1);
    document.getElementById('differenceValue').textContent = difference.toFixed(1);
}

// Actualizar gráfico
function updateChart(digitalTemp, analogTemp) {
    const now = new Date();
    const timeString = `${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

    chart.data.labels.push(timeString);
    chart.data.datasets[0].data.push(analogTemp);
    chart.data.datasets[1].data.push(digitalTemp);

    if (chart.data.labels.length > maxDataPoints) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
        chart.data.datasets[1].data.shift();
    }

    chart.update();
}

// Exportar datos
function exportData() {
    let csvContent = "Tiempo,Sensor Analógico (°C),Sensor Digital (°C),Diferencia\n";

    for (let i = 0; i < chart.data.labels.length; i++) {
        const analog = chart.data.datasets[0].data[i] || 0;
        const digital = chart.data.datasets[1].data[i] || 0;
        const diff = Math.abs(analog - digital);
        csvContent += `${chart.data.labels[i]},${analog.toFixed(2)},${digital.toFixed(2)},${diff.toFixed(2)}\n`;
    }

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `datos_calibracion_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addLogEntry("Datos exportados a CSV", "success");
}

// Limpiar consola
function clearConsole() {
    document.getElementById('consoleLog').innerHTML = '';
    addLogEntry("Consola limpiada", "info");
}

// Añadir entrada al log
function addLogEntry(message, type = "info") {
    const now = new Date();
    const timeString = `[${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}]`;

    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.innerHTML = `<span class="log-time">${timeString}</span> ${message}`;

    const consoleLog = document.getElementById('consoleLog');
    consoleLog.appendChild(logEntry);
    consoleLog.scrollTop = consoleLog.scrollHeight;
}
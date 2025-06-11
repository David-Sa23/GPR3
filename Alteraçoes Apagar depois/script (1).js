const ctx = document.getElementById('graficoDeteccao').getContext('2d');
const LIMITE_DADOS_GRAFICO = 50;

const chart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: 'Tráfego (0 = Normal, 1 = Anômalo)',
            data: [],
            borderColor: 'blue',
            backgroundColor: 'rgba(0, 0, 255, 0.1)',
            pointRadius: 8,
            borderWidth: 2,
            fill: true,
            tension: 0.1,
            pointBackgroundColor: function(context) {
                const data = context.dataset.data || [];
                const value = data[context.dataIndex];
                return value === 1 ? 'red' : 'green';
            }
        }]
    },
    options: {
        scales: {
            y: {
                min: 0,
                max: 1,
                ticks: {
                    stepSize: 1,
                    callback: function(value) {
                        if (value === 0) return 'Normal';
                        if (value === 1) return 'Anómalo';
                        return value;
                    }
                }
            }
        }
    }
});

let intervalId = null;
let intervalIDTabela = null;
let capturaAtiva = false;
let capturaFoiIniciada = false;
let contadorPacotes = 1;

function atualizarEstadoBotoes() {
    document.getElementById('btnIniciar').disabled = capturaAtiva;
    document.getElementById('btnParar').disabled = !capturaAtiva;
    document.getElementById('btnDownload').disabled = !capturaFoiIniciada;
    document.getElementById('btnExportarCSV').disabled = !capturaFoiIniciada;
}

function iniciarAtualizacoes() {
    if (intervalId) clearInterval(intervalId);
    if (intervalIDTabela) clearInterval(intervalIDTabela);

    intervalId = setInterval(atualizar, 1000);
    intervalIDTabela = setInterval(atualizarTabela, 1000);
}

function pararAtualizacoes() {
    if (intervalId) clearInterval(intervalId);
    if (intervalIDTabela) clearInterval(intervalIDTabela);
}

function iniciarCaptura() {
    fetch('/start')
        .then(() => {
            iniciarAtualizacoes();
            capturaAtiva = true;
            capturaFoiIniciada = true;
            atualizarEstadoBotoes();
        })
        .catch(console.error);
}

function pararCaptura() {
    fetch('/stop')
        .then(() => {
            pararAtualizacoes();
            capturaAtiva = false;
            atualizarEstadoBotoes();
        })
        .catch(console.error);
}

function atualizar() {
    fetch('/latest')
        .then(res => res.json())
        .then(data => {
            const lista = document.getElementById('packetList');
            lista.innerHTML = '';

            if (data.length === 0) {
                lista.innerHTML = '<p><em>Nenhum pacote ainda...</em></p>';
                return;
            }

            data.slice().reverse().forEach(pacote => {
                const div = document.createElement('div');
                div.className = 'packet';

                // Usando textContent onde possível para segurança, mas aqui é HTML estruturado.
                div.innerHTML = `
                    <table class="packet-table">
                        <colgroup>
                            <col style="width: 150px;">
                            <col style="width: 150px;">
                        </colgroup>
                        <tr>
                            <td>
                                📥 <strong>${pacote.src}</strong> → <strong>${pacote.dst}</strong>
                            </td>
                            <td rowspan="2" style="vertical-align:middle; text-align:center;">
                                <span title="Status do pacote" class="${pacote.prediction === 1 ? 'anomalo' : 'normal'}" style="font-size:1.2em;">
                                    ${pacote.prediction === 1 ? '🔴 Anómalo' : '🟢 Normal'}
                                </span>
                            </td>
                        </tr>
                        <tr>
                            <td style="background-color:rgb(255, 254, 254) !important;">
                                📦 Tamanho: <strong>${pacote.size} bytes</strong> | Protocolo: <strong>${pacote.protocol}</strong> | Freq: <strong>${pacote.frequency} pkt/s</strong>
                            </td>
                        </tr>
                    </table>
                `;
                lista.appendChild(div);
            });

            const maisRecente = data.slice().reverse()[0];
            const numero = data.length;
            if (maisRecente && typeof maisRecente.prediction !== "undefined") {
                atualizarGrafico(Number(maisRecente.prediction), numero);
            }
        })
        .catch(console.error);
}

function atualizarTabela() {
    fetch('/latest')
        .then(res => res.json())
        .then(data => {
            const tbody = document.querySelector('#packetList2 tbody');
            tbody.innerHTML = '';

            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7"><em>Nenhum pacote ainda...</em></td></tr>';
                // Limpa o gráfico também
                chart.data.labels = [];
                chart.data.datasets[0].data = [];
                chart.update();
                return;
            }

            // Atualiza a tabela
            data.slice().reverse().forEach((pacote, idx) => {
                const numero = data.length - idx; // Numeração decrescente do topo para baixo
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${numero}</td>
                    <td>${pacote.src}</td>
                    <td>${pacote.src_port}</td>
                    <td>${pacote.dst}</td>
                    <td>${pacote.dst_port}</td>
                    <td>${pacote.size}</td>
                    <td>${pacote.protocol}</td>
                    <td>${pacote.frequency}</td>
                    <td class="${pacote.prediction === 1 ? 'anomalo' : 'normal'}" style="font-size:1.2em;">
                        ${pacote.prediction === 1 ? 'Anómalo' : 'Normal'}
                    </td>
                `;
                tbody.appendChild(tr);
            });

            // Atualiza o gráfico para refletir exatamente a tabela (últimos 50 pacotes, ordem correta)
            chart.data.labels = [];
            chart.data.datasets[0].data = [];
            const ultimosPacotes = data.slice(-LIMITE_DADOS_GRAFICO); // pega os últimos 50 (ou menos)
            ultimosPacotes.forEach((pacote, idx) => {
                const numero = data.length - ultimosPacotes.length + idx + 1;
                chart.data.labels.push('Pacote ' + numero);
                chart.data.datasets[0].data.push(Number(pacote.prediction));
            });
            chart.update();
        })
        .catch(console.error);
}

function carregarMetricas() {
    fetch('/metrics')
        .then(res => res.json())
        .then(data => {
            document.getElementById('acc').innerText = data.accuracy ?? '—';
            document.getElementById('prec').innerText = data.precision ?? '—';
            document.getElementById('rec').innerText = data.recall ?? '—';
            document.getElementById('f1').innerText = data.f1 ?? '—';
        })
        .catch(console.error);
}

function atualizarGrafico(dado) {
    chart.data.labels.push('Pacote ' + contadorPacotes++);
    chart.data.datasets[0].data.push(dado);

    if (chart.data.labels.length > LIMITE_DADOS_GRAFICO) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
    }
    chart.update();
}

function alternarFormato() {
    const formato = document.getElementById('formatoView').value;
    document.getElementById('packetList').style.display = formato === 'tabela' ? 'none' : 'block';
    document.getElementById('packetListContainer').style.display = formato === 'tabela' ? 'block' : 'none';
}

window.onload = () => {
    carregarMetricas();
    capturaAtiva = false;
    capturaFoiIniciada = false;
    atualizarEstadoBotoes();
};
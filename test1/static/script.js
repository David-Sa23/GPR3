let intervalId = null;

const protocolos = {
    1: 'ICMP',
    2: 'IGMP',
    6: 'TCP',
    17: 'UDP',
    41: 'IPv6',
    47: 'GRE',
    50: 'ESP',
    51: 'AH',
    89: 'OSPF',
    132: 'SCTP'
};

function iniciarCaptura() {
    fetch('/start')
        .then(() => {
            if (intervalId) clearInterval(intervalId);
            intervalId = setInterval(atualizar, 1000);
        });
}

function pararCaptura() {
    fetch('/stop')
        .then(() => {
            if (intervalId) clearInterval(intervalId);
        });
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

                // Usa o nome do protocolo se disponível, senão exibe o número
                const nomeProtocolo = protocolos[pacote.protocol] || `Desconhecido (${pacote.protocol})`;

                div.innerHTML = `
                    📥 <strong>${pacote.src}</strong> → <strong>${pacote.dst}</strong><br>
                    📦 Tamanho: ${pacote.size} bytes | Protocolo: ${nomeProtocolo} | Freq: ${pacote.frequency} pkt/s<br>
                    Resultado: <span class="${pacote.prediction === 1 ? 'anomalo' : 'normal'}">
                        ${pacote.prediction === 1 ? '🔴 Anómalo' : '🟢 Normal'}
                    </span>
                `;
                lista.appendChild(div);
            });
        });
}

function carregarMetricas() {
    fetch('/metrics')
        .then(res => res.json())
        .then(data => {
            document.getElementById('acc').innerText = data.accuracy;
            document.getElementById('prec').innerText = data.precision;
            document.getElementById('rec').innerText = data.recall;
            document.getElementById('f1').innerText = data.f1;
        });
}

window.onload = () => {
    carregarMetricas();
}


function iniciarCaptura() {
    fetch('/start')
        .then(() => {
            if (intervalId) clearInterval(intervalId);
            intervalId = setInterval(atualizar, 1000);

            // Atualiza semáforo
            document.getElementById("semaforo").classList.remove("parado");
            document.getElementById("semaforo").classList.add("ativo");

            // Atualiza texto do estado
            document.getElementById("estadoCaptura").innerText = "🟢 Capturando...";
        });
}

function pararCaptura() {
    fetch('/stop')
        .then(() => {
            if (intervalId) clearInterval(intervalId);

            // Atualiza semáforo
            document.getElementById("semaforo").classList.remove("ativo");
            document.getElementById("semaforo").classList.add("parado");

            // Atualiza texto do estado
            document.getElementById("estadoCaptura").innerText = "🟥 Parado";
        });
}

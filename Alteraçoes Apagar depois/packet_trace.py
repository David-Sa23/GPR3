# -*- coding: utf-8 -*-

from flask import Flask, render_template, jsonify, send_file, Response
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.metrics import classification_report
from scapy.all import sniff
from scapy.layers.inet import IP
import threading
import matplotlib.pyplot as plt
import matplotlib
import io

matplotlib.use('Agg')  # Backend para gerar imagens sem interface grafica

app = Flask(__name__)

# Variaveis globais controlando estado
latest_predictions = []
sniffing = False
start_time = None

# Carregamento e treinamento do modelo ML
df = pd.read_csv('captura_real2.csv')
X = df[['packet_size', 'protocol', 'packet_frequency']]
y = df['label']

scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)
X_train, X_test, y_train, y_test = train_test_split(X_scaled, y, test_size=0.2, random_state=42)

mlp = MLPClassifier(hidden_layer_sizes=(10, 5), max_iter=1000, random_state=42)
mlp.fit(X_train, y_train)


def predict_realtime(packet):
    global start_time, latest_predictions, sniffing

    if not sniffing or not packet.haslayer(IP):
        return

    # Mapeamento de protocolos para numeros
    proto_map = {6: 1, 17: 2, 1: 3}
    protocol_num = proto_map.get(packet[IP].proto, 3)

    protocol_labels = {1: 'TCP', 2: 'UDP', 3: 'ICMP'}
    protocol_name = protocol_labels.get(protocol_num, 'Outro')

    packet_size = len(packet)
    current_time = packet.time

    # Calcula frequencia baseada no intervalo de tempo entre pacotes
    if start_time is None:
        start_time = current_time

    elapsed = max(current_time - start_time, 0.001)  # Evita divisao por zero
    freq = 1 / elapsed
    start_time = current_time

    src = packet[IP].src
    dst = packet[IP].dst

    input_data = pd.DataFrame([[packet_size, protocol_num, freq]],
                              columns=['packet_size', 'protocol', 'packet_frequency'])
    input_scaled = scaler.transform(input_data)
    pred = int(mlp.predict(input_scaled)[0])

    # Armazena apenas os ultimos 100 pacotes para evitar crescimento infinito
    latest_predictions.append({
        "src": src,
        "dst": dst,
        "size": packet_size,
        "protocol": protocol_name,
        "frequency": round(freq, 2),
        "prediction": pred
    })
    if len(latest_predictions) > 250: # Limita a 250 entradas
        # Remove o primeiro elemento se a lista exceder o tamanho maximo
        latest_predictions.pop(0)


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/start')
def start_sniff():
    global sniffing
    if sniffing:
        return jsonify({"status": "Já está capturando"}), 400

    sniffing = True
    thread = threading.Thread(target=lambda: sniff(prn=predict_realtime, store=False))
    thread.daemon = True
    thread.start()
    return jsonify({"status": "sniffing started"})


@app.route('/stop')
def stop_sniff():
    global sniffing
    sniffing = False
    return jsonify({"status": "sniffing stopped"})


@app.route('/latest')
def get_latest():
    return jsonify(latest_predictions)


@app.route('/metrics')
def get_metrics():
    y_pred = mlp.predict(X_test)
    report = classification_report(y_test, y_pred, output_dict=True)

    # Pode nao haver classe '1', tratar caso
    metrics = {
        "accuracy": round(report.get("accuracy", 0) * 100, 2),
        "precision": round(report.get("1", {}).get("precision", 0) * 100, 2),
        "recall": round(report.get("1", {}).get("recall", 0) * 100, 2),
        "f1": round(report.get("1", {}).get("f1-score", 0) * 100, 2)
    }
    return jsonify(metrics)


@app.route('/download-graph')
def download_graph():
    if not latest_predictions:
        return "Nenhum dado disponível para gerar gráfico", 400

    counts = {0: 0, 1: 0}
    for p in latest_predictions:
        counts[p["prediction"]] = counts.get(p["prediction"], 0) + 1

    labels = ['Normal', 'Anómalo']
    values = [counts[0], counts[1]]
    colors = ['green', 'red']

    plt.figure(figsize=(5, 4))
    plt.bar(labels, values, color=colors)
    plt.title("Distribuição de Pacotes Detetados")
    plt.ylabel("Quantidade")

    img = io.BytesIO()
    plt.savefig(img, format='png')
    img.seek(0)
    plt.close()

    return send_file(img, mimetype='image/png', as_attachment=True, download_name='grafico_analise.png')


@app.route('/export-csv')
def export_csv():
    if not latest_predictions:
        return "Nenhum dado para exportar", 400

    import csv
    import io

    si = io.StringIO()
    cw = csv.writer(si)
    cw.writerow(['Origem', 'Destino', 'Tamanho (bytes)', 'Protocolo', 'Frequência (pkt/s)', 'Predição'])

    for pkt in latest_predictions:
        cw.writerow([
            pkt['src'],
            pkt['dst'],
            pkt['size'],
            pkt['protocol'],
            pkt['frequency'],
            'Anómalo' if pkt['prediction'] == 1 else 'Normal'
        ])

    output = si.getvalue()
    return Response(
        output,
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment;filename=trafego.csv"}
    )

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=False)
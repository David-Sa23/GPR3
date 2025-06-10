from flask import Flask, render_template, jsonify, send_file
import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.metrics import accuracy_score, classification_report
from scapy.all import sniff, IP
import threading

app = Flask(__name__)

captured_data = []
start_time = None
latest_predictions = []
sniffing = False

# Modelo
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
    if not sniffing:
        return
    if packet.haslayer(IP):
        packet_size = len(packet)
        proto_map = {6: 1, 17: 2, 1: 3}
        protocol = proto_map.get(packet[IP].proto, 3)
        current_time = packet.time
        if start_time is None:
            start_time = current_time
        elapsed = max(current_time - start_time, 0.001)
        freq = 1 / elapsed
        start_time = current_time

        src = packet[IP].src
        dst = packet[IP].dst

        input_data = pd.DataFrame([[packet_size, protocol, freq]],
                                  columns=['packet_size', 'protocol', 'packet_frequency'])
        input_scaled = scaler.transform(input_data)
        pred = int(mlp.predict(input_scaled)[0])

        latest_predictions.append({
            "src": src,
            "dst": dst,
            "size": packet_size,
            "protocol": protocol,
            "frequency": round(freq, 2),
            "prediction": pred
        })

        latest_predictions[:] = latest_predictions[-100:]

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/start')
def start_sniff():
    global sniffing
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
    report = classification_report(y_test, mlp.predict(X_test), output_dict=True)
    return jsonify({
        "accuracy": round(report["accuracy"] * 100, 2),
        "precision": round(report["1"]["precision"] * 100, 2),
        "recall": round(report["1"]["recall"] * 100, 2),
        "f1": round(report["1"]["f1-score"] * 100, 2)
    })

@app.route('/download-graph')
def download_graph():
    if not latest_predictions:
        return "Nenhum dado disponível para gerar gráfico", 400

    # Contar predições: 0 = Normal, 1 = Anómalo
    import matplotlib.pyplot as plt
    import io

    counts = {0: 0, 1: 0}
    for p in latest_predictions:
        counts[p["prediction"]] += 1

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

if __name__ == '__main__':
    app.run(debug=True)

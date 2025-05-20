from flask import Flask, send_from_directory, jsonify, request
from flask_cors import CORS
import serial
import time
import threading
import re
import logging
from datetime import datetime
import csv
from serial.tools import list_ports

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

# Datos compartidos
data = {
    "analogTemp": 0.0,
    "digitalTemp": 0.0,
    "difference": 0.0,
    "connected": False
}

# Estado de la conexión y control de hilo
serial_connection = None
running = False
read_thread = None

# === Rutas web ===

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/api/data')
def get_data():
    return jsonify(data)

@app.route('/api/connect', methods=['POST'])
def connect():
    global serial_connection, running, read_thread

    if serial_connection and serial_connection.is_open:
        return jsonify({"status": "already connected"})

    port = find_arduino_port()
    if not port:
        return jsonify({"status": "arduino not found"}), 404

    try:
        serial_connection = serial.Serial(port, 9600, timeout=1)
        data["connected"] = True
        running = True
        read_thread = threading.Thread(target=read_serial, daemon=True)
        read_thread.start()
        print(f"Conectado a {port}")
        return jsonify({"status": "connected"})
    except Exception as e:
        print(f"Error al conectar: {e}")
        data["connected"] = False
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/disconnect', methods=['POST'])
def disconnect():
    global serial_connection, running
    running = False
    try:
        if serial_connection and serial_connection.is_open:
            serial_connection.close()
        serial_connection = None
        data["connected"] = False
        print("Desconectado del Arduino.")
        return jsonify({"status": "disconnected"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# === Funciones auxiliares ===

def find_arduino_port():
    ports = list_ports.comports()
    for port in ports:
        if "Arduino" in port.description or "USB Serial" in port.description or "CH340" in port.description:
            return port.device
    return None

def read_serial():
    global serial_connection, running, data
    print("Iniciando lectura serial...")

    filename = f"datos_temperatura_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    csvfile = open(filename, mode='w', newline='')
    writer = csv.writer(csvfile)
    writer.writerow(["Tiempo", "Sensor_Analogico", "Sensor_Digital", "Diferencia", "Datos_Crudos_Sensor_Analogico"])

    try:
        while running:
            if serial_connection and serial_connection.is_open:
                try:
                    line = serial_connection.readline().decode().strip()
                    if line:
                        print(">>", line)
                        values = re.findall(r"[-+]?\d*\.\d+|\d+", line)
                        if len(values) >= 4:
                            analog = float(values[0])
                            digital = float(values[1])
                            diff = float(values[2])
                            raw = float(values[3])
                            data["analogTemp"] = analog
                            data["digitalTemp"] = digital
                            data["difference"] = diff

                            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                            writer.writerow([timestamp, analog, digital, diff, raw])
                            csvfile.flush()
                        elif len(values) == 3:
                            # Por compatibilidad si llega solo 3 valores
                            analog = float(values[0])
                            digital = float(values[1])
                            diff = float(values[2])
                            data["analogTemp"] = analog
                            data["digitalTemp"] = digital
                            data["difference"] = diff
                            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                            writer.writerow([timestamp, analog, digital, diff, ""])
                            csvfile.flush()
                except Exception as e:
                    print(f"Error leyendo datos: {e}")
            time.sleep(1)
    finally:
        csvfile.close()
        print(f"Archivo CSV guardado como {filename}")

# === Iniciar servidor ===

if __name__ == '__main__':
    print("Servidor Flask ejecutándose en http://127.0.0.1:5000")
    log = logging.getLogger('werkzeug')
    log.setLevel(logging.ERROR)
    app.run(debug=True, use_reloader=False, port=5000)

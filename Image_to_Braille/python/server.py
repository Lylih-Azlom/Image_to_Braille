import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

from flask import Flask, request, jsonify
from flask_cors import CORS
import easyocr
import time
import serial
import serial.tools.list_ports


app = Flask(__name__)
CORS(app)

# 아두이노 연결 정보
BAUD_RATE = 9600
arduino = None

def find_arduino():
    ports = serial.tools.list_ports.comports()

    for port in ports:
        print("발견된 포트:", port.device, port.description)

        if "Arduino" in port.description:
            return port.device

    return None

# OCR 준비
reader = easyocr.Reader(['en'])

# 사진 저장 폴더
UPLOAD_FOLDER = "media"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# 아두이노 프린트 api
@app.route("/api/print", methods=["POST"])
def print_braille():

    data = request.get_json()

    if not data:
        return jsonify({
            "error": "데이터가 없습니다."
        }), 400

    text = data.get("text", "")

    if not text:
        return jsonify({
            "error": "출력할 문자가 없습니다."
        }), 400

    try:
        # Arduino 연결
        connect_arduino()

        # Arduino로 문자열 전송
        arduino.write((text + "\n").encode("utf-8"))

        print("Arduino 전송:", text)

        return jsonify({
            "message": "Arduino로 전송했습니다."
        })

    except Exception as e:

        return jsonify({
            "error": str(e)
        }), 500

@app.route("/api/recognize", methods=["POST"])
def recognize():

    # 1. 웹페이지에서 사진을 받음
    if "image" not in request.files:
        return jsonify({
            "error": "이미지가 없습니다."
        }), 400

    image = request.files["image"]

    # 2. 파일 이름 확인
    if image.filename == "":
        return jsonify({
            "error": "파일이 선택되지 않았습니다."
        }), 400

    # 3. 사진 저장
    image_path = os.path.join(UPLOAD_FOLDER, "image.png")
    image.save(image_path)

    # 4. EasyOCR로 글자 인식
    result = reader.readtext(image_path)

    # 5. OCR 결과에서 글자만 추출
    text = " ".join(
        detection[1]
        for detection in result
    )

    print("OCR 결과:", text)

    # 6. 웹페이지에 결과 전달
    return jsonify({
        "text": text
    })
 # arduino 연결 함수
def connect_arduino():
    global arduino

    if arduino is not None and arduino.is_open:
        return

    arduino = serial.Serial(
        find_arduino(),
        BAUD_RATE,
        timeout=1
    )

    time.sleep(2)

    print("Arduino 연결 완료:", find_arduino())


if __name__ == "__main__":
    print("Python OCR 서버를 시작합니다.")
    print("주소: http://127.0.0.1:5000")

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=False
    )



// Dual 28BYJ-48 + ULN2003
// 90 mm rack / 15 positions
// English Braille A-Z
//
// Motor 1 : Braille dots 1,2,3
// Motor 2 : Braille dots 4,5,6
//
// Physical mapping correction:
// Motor 1 : dot 1 <-> dot 3
// Motor 2 : dot 4 <-> dot 6
//
// String input + 1.5 second delay
// HOME command


const uint8_t motor1Pins[4] = {2, 3, 4, 5};
const uint8_t motor2Pins[4] = {6, 7, 8, 9};


// =====================================================
// Gear / Rack settings
// =====================================================

const float moduleValue = 1.27324f;
const int toothCount = 24;

const float pitchDiameterMm =
  moduleValue * toothCount;

const float circularPitchMm =
  3.14159265f * moduleValue;

const float sliderTravelPerRevMm =
  circularPitchMm * toothCount;


// 실제 측정값
const long halfStepsPerOutputRev = 2600L;


// Rack total travel
const float travelLimitMm = 90.0f;


// =====================================================
// 15 positions
// =====================================================

const float stopPositionsMm[] = {
  0.0f,
  6.43f,
  12.86f,
  19.29f,
  25.71f,
  32.14f,
  38.57f,
  45.00f,
  51.43f,
  57.86f,
  64.29f,
  70.71f,
  77.14f,
  83.57f,
  90.0f
};

const uint8_t stopCount =
  sizeof(stopPositionsMm) / sizeof(stopPositionsMm[0]);


// =====================================================
// Half-step sequence
// =====================================================

const uint8_t halfStep[8][4] = {
  {1,0,0,0},
  {1,1,0,0},
  {0,1,0,0},
  {0,1,1,0},
  {0,0,1,0},
  {0,0,1,1},
  {0,0,0,1},
  {1,0,0,1}
};


// =====================================================
// 현재 모터 위치
// =====================================================

long currentSteps[2] = {0, 0};

uint8_t phase[2] = {0, 0};


// =====================================================
// 알파벳
// =====================================================

const char alphabet[] = {
  'A','B','C','D','E','F','G','H','I','J',
  'K','L','M','N','O','P','Q','R','S','T',
  'U','V','W','X','Y','Z'
};


// =====================================================
// 알파벳 → Motor 1 단계
//
// Motor 1 = 점자 1, 2, 3
//
// 실제 장치에서 점 1과 점 3의 위치가 반대이므로
// 기존 매핑에서 점 1 <-> 점 3을 반영함.
// =====================================================

const uint8_t motor1Stage[] = {

  1,  // A
  3,  // B
  1,  // C
  1,  // D
  1,  // E
  3,  // F
  3,  // G
  3,  // H
  9,  // I
  9,  // J
  7,  // K
  4,  // L
  7,  // M
  7,  // N
  7,  // O
  4,  // P
  4,  // Q
  4,  // R
  6,  // S
  6,  // T
  7,  // U
  4,  // V
  9,  // W
  7,  // X
  7,  // Y
  7   // Z
};


// =====================================================
// 알파벳 → Motor 2 단계
//
// Motor 2 = 점자 4, 5, 6
//
// 실제 장치에서 점 4와 점 6의 위치가 반대이므로
// 점 4 <-> 점 6을 반영함.
//
// 기존 단계 관계:
//
// A = 000 → 0
// B = 001 → 기존 12
// C = 010 → 기존 5
// D = 011 → 기존 11
// E = 100 → 기존 4
// F = 101 → 기존 7
// G = 110 → 기존 8
// H = 111 → 기존 9
//
// 점 4 <-> 점 6을 뒤집으면:
//
// 000 → 0
// 001 → 4
// 010 → 5
// 011 → 8
// 100 → 12
// 101 → 7
// 110 → 11
// 111 → 9
// =====================================================

// ==============================
// Motor 2 - Braille 4,5,6
// ==============================

const uint8_t motor2Stage[] = {
  0,   // A
  0,   // B
  3,   // C
  7,   // D
  4,   // E
  6,   // F
  7,   // G
  4,   // H
  3,   // I
  7,   // J
  0,   // K
  0,   // L
  3,   // M
  7,   // N
  4,   // O
  6,   // P
  7,   // Q
  4,   // R
  3,   // S
  7,   // T
  11,  // U
  11,  // V
  11,  // W
  6,   // X
  11,  // Y
  10   // Z
};


// =====================================================
// 모터 출력
// =====================================================

void writeMotor(
  const uint8_t pins[4],
  uint8_t p
) {

  for (uint8_t i = 0; i < 4; ++i) {

    digitalWrite(
      pins[i],
      halfStep[p][i]
    );
  }
}


// =====================================================
// 모터 전원 해제
// =====================================================

void releaseMotor(
  const uint8_t pins[4]
) {

  for (uint8_t i = 0; i < 4; ++i) {

    digitalWrite(
      pins[i],
      LOW
    );
  }
}


// =====================================================
// mm → motor step
// =====================================================

long mmToSteps(float mm) {

  return lround(
    (mm / sliderTravelPerRevMm)
    * halfStepsPerOutputRev
  );
}


// =====================================================
// 모터를 특정 mm 위치로 이동
// =====================================================

void moveMotorToMm(
  uint8_t motor,
  float mm
) {

  if (
    motor > 1 ||
    mm < 0 ||
    mm > travelLimitMm
  ) {

    Serial.println(
      F("Out of range: 0 ~ 90 mm")
    );

    return;
  }


  const uint8_t *pins =
    (motor == 0)
    ? motor1Pins
    : motor2Pins;


  long target =
    mmToSteps(mm);


  long delta =
    target - currentSteps[motor];


  int8_t direction =
    (delta >= 0) ? 1 : -1;


  long count =
    labs(delta);


  for (
    long i = 0;
    i < count;
    ++i
  ) {

    if (direction > 0) {

      phase[motor] =
        (phase[motor] + 1) & 7;

    }
    else {

      phase[motor] =
        (phase[motor] + 7) & 7;
    }


    writeMotor(
      pins,
      phase[motor]
    );


    delay(2);
  }


  currentSteps[motor] =
    target;


  releaseMotor(pins);


  Serial.print(F("Motor "));
  Serial.print(motor + 1);

  Serial.print(F(" -> "));
  Serial.print(mm, 2);

  Serial.println(F(" mm"));
}


// =====================================================
// 단계 번호 → 모터 이동
// =====================================================

void moveMotorToStage(
  uint8_t motor,
  uint8_t stage
) {

  if (stage >= stopCount) {

    Serial.println(
      F("Invalid stage.")
    );

    return;
  }


  moveMotorToMm(
    motor,
    stopPositionsMm[stage]
  );
}


// =====================================================
// 알파벳 → 두 모터 이동
// =====================================================

void moveToLetter(
  char letter
) {

  // ---------------------------------------------
  // 소문자를 대문자로 변환
  // ---------------------------------------------

  if (
    letter >= 'a' &&
    letter <= 'z'
  ) {

    letter =
      letter - 'a' + 'A';
  }


  // ---------------------------------------------
  // A~Z인지 확인
  // ---------------------------------------------

  if (
    letter < 'A' ||
    letter > 'Z'
  ) {

    Serial.println(
      F("Please enter A-Z.")
    );

    return;
  }


  // ---------------------------------------------
  // 알파벳 배열의 위치
  // ---------------------------------------------

  uint8_t index =
    letter - 'A';


  uint8_t stage1 =
    motor1Stage[index];

  uint8_t stage2 =
    motor2Stage[index];


  // ---------------------------------------------
  // 현재 문자 출력
  // ---------------------------------------------

  Serial.print(F("Letter: "));
  Serial.println(letter);

  Serial.print(F("Motor 1 stage: "));
  Serial.println(stage1);

  Serial.print(F("Motor 2 stage: "));
  Serial.println(stage2);


  // ---------------------------------------------
  // 두 모터 이동
  // ---------------------------------------------

  moveMotorToStage(
    0,
    stage1
  );

  moveMotorToStage(
    1,
    stage2
  );
}


// =====================================================
// 문자열 전체를 한 글자씩 표시
// =====================================================

void displayWord(
  String word
) {

  // 앞뒤 공백 제거

  word.trim();


  // 빈 문자열이면 종료

  if (
    word.length() == 0
  ) {

    return;
  }


  Serial.print(
    F("Displaying: ")
  );

  Serial.println(word);


  // ---------------------------------------------
  // 문자열을 한 글자씩 처리
  // ---------------------------------------------

  for (
    int i = 0;
    i < word.length();
    ++i
  ) {

    char letter =
      word.charAt(i);


    // -------------------------------------------
    // 공백은 건너뜀
    // -------------------------------------------

    if (
      letter == ' '
    ) {

      continue;
    }


    // -------------------------------------------
    // 한 글자 표시
    // -------------------------------------------

    moveToLetter(letter);


    // -------------------------------------------
    // 다음 글자로 넘어가기 전 2초 대기
    // -------------------------------------------

    if (
      i < word.length() - 1
    ) {

      delay(2000);
    }
  }


  Serial.println(
  F("Done.")
);

// ================================================
// 출력 완료 후 HOME
// ================================================

delay(1500);

homeMotors();
}



// =====================================================
// HOME
//
// 두 모터를 0 mm 위치로 이동
// 프로그램상의 현재 위치도 0으로 설정
// =====================================================

void homeMotors() {

  Serial.println(
    F("Homing...")
  );


  // Motor 1 → 0 mm

  moveMotorToMm(
    0,
    0.0f
  );


  // Motor 2 → 0 mm

  moveMotorToMm(
    1,
    0.0f
  );


  // 프로그램상의 위치 초기화

  currentSteps[0] = 0;
  currentSteps[1] = 0;


  Serial.println(
    F("HOME complete.")
  );
}


// =====================================================
// SETUP
// =====================================================

void setup() {

  // 모터 핀 설정

  for (
    uint8_t i = 0;
    i < 4;
    ++i
  ) {

    pinMode(
      motor1Pins[i],
      OUTPUT
    );

    pinMode(
      motor2Pins[i],
      OUTPUT
    );
  }


  // 모터 전원 해제

  releaseMotor(
    motor1Pins
  );

  releaseMotor(
    motor2Pins
  );


  // Serial 시작

  Serial.begin(9600);


  Serial.println(
    F("Dual 28BYJ-48 Braille controller ready.")
  );

  Serial.println(
    F("Enter a word or sentence.")
  );

  Serial.println(
    F("Example: HELLO")
  );

  Serial.println(
    F("Enter HOME to return to position 0.")
  );


  // 기어 정보

  Serial.print(
    F("Pitch diameter: ")
  );

  Serial.print(
    pitchDiameterMm
  );

  Serial.println(
    F(" mm")
  );


  Serial.print(
    F("Rack travel per revolution: ")
  );

  Serial.print(
    sliderTravelPerRevMm
  );

  Serial.println(
    F(" mm")
  );


  Serial.print(
    F("90 mm endpoint steps: ")
  );

  Serial.println(
    mmToSteps(90.0f)
  );
}


// =====================================================
// LOOP
// =====================================================

void loop() {

  if (
    Serial.available()
  ) {

    // Serial Monitor에서 한 줄 전체 입력

    String input =
      Serial.readStringUntil('\n');


    // 앞뒤 공백 제거

    input.trim();


    // 아무것도 입력되지 않았다면 종료

    if (
      input.length() == 0
    ) {

      return;
    }


    // =================================================
    // HOME 명령
    // =================================================

    if (
      input.equalsIgnoreCase("HOME")
    ) {

      homeMotors();

      return;
    }


    // =================================================
    // 그 외에는 문자열로 처리
    // =================================================

    displayWord(input);
  }
}

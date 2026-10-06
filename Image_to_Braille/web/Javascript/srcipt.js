const $ = id => document.getElementById(id); // document.getElementById()를 $로 축약

const DELAYTIME = 1500;

let selectedFile = null; // 이미지 파일 저장용 변수
let brailleCells = []; // 점자 셀 목록
let inputTimer = null; // 음성 안내 모드에서 마지막 입력 후 경과한 시간

// 문자열을 점자 패턴으로 연결하는 표
/*
점자의 자리는 다음과 같이 표시
1 4
2 5
3 6
돌출된 점들은 각각 1, 2, 4, 8, 16, 32의 가중치를 가지고, 이들의 합이 곧 점자가 나타내는 알파벳의 코드가 된다.
가령 b를 표시한다 하면, 1과 2가 돌출되는데, 이 둘을 합하면 3이 되는 방식이다.
유니코드에서도 이런 방식으로 점자의 유니코드를 부여한다.
*/
const map = {
    a: 1, b: 3, c: 9, d: 25, e: 17, f: 11,
    g: 27, h: 19, i: 10, j: 26, k: 5, l: 7,
    m: 13, n: 29, o: 21, p: 15, q: 31, r: 23,
    s: 14, t: 30, u: 37, v: 39, w: 58, x: 45,
    y: 61, z: 53,
    '1': 1, '2': 3, '3': 9, '4': 25, '5': 17,
    '6': 11, '7': 27, '8': 19, '9': 10, '0': 26,
    ',': 2, ';': 6, ':': 18, '.': 50, '!': 22, '?': 38,
    '-': 36, "'": 4, '"': 20, '(': 54, ')': 54, '/': 12
};
// 대문자, 숫자, 공백의 점자 코드
// * 점자에서는 따로 대소문자가 동일한 대신 대문자 앞에 대문자 점자를 추가한다.
// * 숫자 또한 마찬가지다. 숫자 표시를 표시한 수, 그 뒤에 점자를 표시한다.
const cap = 32, num = 60, space = 0;

// 문자열을 점자로 변환
function enc(text) {
    const out = [];
    let inNum = false;
    for (const ch of text) {
        const c = ch.toLowerCase();
        // 공백, 줄바꿈, 탭일 경우
        if (ch === ' ' || ch === '\n' || ch === '\t') {
            out.push({ ch: ' ', bits: space }); // 공백을 나타내는 점자로 추가
            inNum = false;
            continue;
        }
        // 대문자일 경우
        if (/[A-Z]/.test(ch))
            out.push({ ch: '⠠', bits: cap, source: '' }); // 대문자 표시용 점자 추가
        // 숫자일 경우
        if (/[0-9]/.test(ch) && !inNum) {
            out.push({ ch: '⠼', bits: num, source: '' }); // 숫자 표시용 점자 추가
            inNum = true;
        }
        // 숫자가 아니면
        if (!/[0-9]/.test(ch))
            inNum = false; // 숫자묶음 탈출

        const bits = map[c]; // 점자 맵에서 현재 문자에 맞는 점자 불러오기

        // 없는 문자(undefined)가 아니라면
        if (bits !== undefined)
            out.push({ ch, bits, source: ch }); // 결과물(out) 끝에 객체 추가
    }

    return out; // 저장된 결과물 반환
}

// 점자를 화면에 표시할 HTML 작성
function dots(bits) {
    return [0, 3, 1, 4, 2, 5].map(
        /*
        1 4
        2 5
        3 6
        방식으로 배치하기 위한 배열
        */
        (n) => {
            const on = !!(bits & (1 << n)); // 해당하는 비트에 점자가 켜져있는지 확인
            return `<i class="dot ${on ? 'on' : ''}"></i>` // HTML 문법으로 반환
        }
    ).join(''); // 각 HTML 구문을 아무것도 삽입하지 않은 채 하나로 합쳐 반환
}

// 문자열을 읽여 화면에 갱신
// !!! 문자열을 지울 시 갱신이 제대로 되지 않는 문제 있음 !!! (버튼을 통해서는 작동함)
function render() {
    const txt = $('recognized').value; // OCR로 읽은 문자열을 txt에 저장
    $('charCount').textContent = `${txt.length}자`; // 글자 수 표시
    brailleCells = enc(txt); // enc를 호출해 점자 목록으로 변환
    const vis = brailleCells.map(x => String.fromCharCode(0x2800 + x.bits)).join(''); // 유니코드로 변환
    $('brailleText').textContent = vis; // 점자 미리보기에 변환된 점자 표시
    $('empty').style.display = txt.trim() ? 'none' : 'block'; // 입력이 있으면 안내 문구를 숨기고, 아니면 표시
    $('printBtn').disabled = !txt.trim(); // 입력된 텍스트가 없으면 변환 버튼 비활성화
    $('cells').innerHTML = brailleCells.slice(0, 100).map(x =>
        `<span class="cell"><span class="dots">${dots(x.bits)}</span>${x.source || '기호'}</span>` // 미리보기용 HTML 생성 (최대 100개의 셀)
    ).join('');
    $('step2').classList.toggle('active', !!selectedFile || !!txt.trim()); // 이미지가 선택됐거나 텍스트가 존재할 시 2단계(텍스트 확인) 표시 활성화
    $('step3').classList.toggle('active', !!txt.trim());
}

// 음성 안내 모드에서 일정 기간 입력이 없을 시 실행
function finishBlindInput() {
    const text = $('recognized').value.trim();
    if (!text)
        return;
    render();

    $('ocrStatus').className = 'status ok';
    $('ocrStatus').textContent = '일정 시간이 지나 점자로 변환합니다.';

    // 음성 출력이 불가능할 경우 실행 (예외처리)
    if (!('speechSynthesis' in window)) {
        toast('이 브라우저는 음성 읽기를 지원하지 않습니다.');
        return;
    }

    window.speechSynthesis.cancel(); // 이전 음성 출력 최소화(오디오 겹침 방지)
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US'; // 읽기 언어를 영어로 지정
    window.speechSynthesis.speak(utterance);
}

// 하단 팝업 메세지
function toast(msg) {
    $('toast').textContent = msg;
    $('toast').classList.add('show');
    setTimeout(() => $('toast').classList.remove('show'), 2400);
}

// 업로드된 파일 저장
function setFile(file) {
    if (!file)
        return;
    // 지정 형식 외의 파일이 올라올 경우
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
        toast('PNG, JPG, WEBP 파일만 업로드할 수 있습니다.'); // 팝업 메세지 출력
        return;
    }
    selectedFile = file;
    $('preview').src = URL.createObjectURL(file);
    $('preview').style.display = 'block'; // 미리보기 출력
    $('dropContent').style.display = 'none'; // 안내 메세지 숨김
    $('recognizeBtn').disabled = false; // 인식 버튼 활성화
    $('clearBtn').disabled = false; // 초기화 버튼 활성화
    $('ocrStatus').textContent = '이미지 업로드 완료'; // 최하단의 상태메세지 변경
    $('ocrStatus').className = 'status ok';
    $('step1').classList.add('active'); // 1단계(이미지 업로드) 완료 표시
}
// 이미지 파일을 드래그 & 드롭으로 가져올 시
$('file').addEventListener('change', e => setFile(e.target.files[0]));
// 드래그해서 파일 업로드 영역으로 들어오면
['dragenter', 'dragover'].forEach(ev => $('drop').addEventListener(ev, e => {
    e.preventDefault(); // 기본 파일 열기 동작 봉쇄
    $('drop').classList.add('over'); // 이미지 영역 모양 변경
}));
// 다시 빠져나가면
['dragleave', 'drop'].forEach(ev => $('drop').addEventListener(ev, e => {
    e.preventDefault();
    $('drop').classList.remove('over'); // 이미지 영역 모양 복원
}));
$('drop').addEventListener('drop', e => setFile(e.dataTransfer.files[0]));
// 지우기 버튼을 눌렀을 시
$('clearBtn').onclick = () => {
    selectedFile = null; $('file').value = ''; // 파일 비우기 (같은 파일을 선택해도 change 이벤트가 발생하도록)
    $('preview').removeAttribute('src'); // 이미지 주소 제거
    $('preview').style.display = 'none'; // 미리보기 이미지 숨김
    $('dropContent').style.display = 'block'; // 드롭 영역 표시
    $('recognizeBtn').disabled = true; // OCR 버튼 비활성화
    $('clearBtn').disabled = true; // 지우기 버튼 비활성화
    $('ocrStatus').textContent = '';
    $('step1').classList.remove('active'); // 1단계 표시 비활성화
};

// OCR 결과창(recognized)의 내용이 달라질 시 실행
$('recognized').addEventListener('input', () => {
    // 음성 안내 모드가 아니라면
    if (!$('blindMode').checked) {
        render(); // 즉시 새로고침
        return;
    }
    clearTimeout(inputTimer);
    $('ocrStatus').className = 'status';
    $('ocrStatus').textContent = '입력을 멈추면 소리내서 읽은 후 점자로 변환합니다.';
    inputTimer = setTimeout(finishBlindInput, DELAYTIME) // DELAYTIME만큼 기다린 후 결과 출력
});
// 음성 안내 모드에서 OCR 결과창이 달라질 시 실행
$('blindMode').addEventListener('change', () => {
    clearTimeout(inputTimer);
    if (!$('blindMode').checked) {
        window.speechSynthesis?.cancel();
        render();
        $('ocrStatus').textContent = '음성 안내 모드 활성화. 입력과 동시에 점자로 변환합니다.';
    }
    else {
        $('ocrStatus').textContent = '음성 안내 모드 비활성화. 입력을 멈추면 읽고 변환합니다.';
    }
});
// 변환 버튼 클릭 시
$('convertBtn').onclick = () => {
    clearTimeout(inputTimer);
    render();
    if ($('recognized').value.trim())
        toast('미리보기를 업데이트합니다.');
    else
        toast('먼저 영문을 입력하거나 인식해 주세요.');
};
// 인식 버튼 동작
$('recognizeBtn').onclick = async () => { // async: 요청이 끝날 때까지 대기
    if (!selectedFile) // 선택한 이미지가 없을 시
        return; // 함수 종료
    const btn = $('recognizeBtn');
    btn.disabled = true; // 버튼 비활성화 (중복 클릭 방지)
    btn.textContent = '인식 중입니다.'; // 비활성화에 따른 상태 변화 표시
    $('ocrStatus').className = 'status';
    $('ocrStatus').textContent = 'Python 서버에 이미지를 보냅니다.';
    // 예외처리
    try {
        const form = new FormData();
        form.append('image', selectedFile); // formData에 이미지 파일 삽입
        const base = $('apiBase').value.replace(/\/$/, '');
        const res = await fetch(base + '/api/recognize', { method: 'POST', body: form }); // /api/recognize를 붙여 POST 요청 전송
        if (!res.ok)
            throw Error(`서버 응답 ${res.status}`); // 서버 응답 없음
        const data = await res.json();
        const value = data.text ?? data.recognized_text ?? data.result; // 셋 중 null이나 undefined가 아닌 가장 왼쪽에 있는 값 반환
        if (typeof value !== 'string')
            throw Error('응답에 text 필드가 없습니다.'); // OCR 결과가 문자열이 아니면 오류로 처리
        $('recognized').value = value; // OCR 결과를 영문 입력란에 표시
        // 음성 안내 모드 활성화 중
        if ($('blindMode').checked) {
            clearTimeout(inputTimer);
            $('ocrStatus').className = 'status';
            $('ocrStatus').textContent = 'OCR이 완료되었습니다. 잠시 후 인식된 영문을 읽고 점자로 변환합니다.';
            inputTimer = setTimeout(finishBlindInput, DELAYTIME); // DELAYTIME 만큼 기다린 후 결과 표시
        }
        // 음성 안내 모드가 아닐 시
        else {
            render(); // 즉시 결과 표시
            $('ocrStatus').className = 'status ok';
            $('ocrStatus').textContent = '인식이 완료되었습니다. 결과를 확인하고 필요한 부분을 수정해 주세요.';
        }
    }
    // 예외 발생 시 오류 표시
    catch (err) {
        $('ocrStatus').className = 'status error';
        $('ocrStatus').textContent =`인식 요청 실패: ${err.message}.
                                    서버 주소와 /api/recognize 연결을 확인하거나 아래에 영문을 직접 입력해 주세요.`
    }
    // 상태 초기화
    finally {
        btn.disabled = false;
        btn.textContent = '이미지에서 글자 인식';
    }
};
// 출력 버튼을 누를 시
$('printBtn').onclick = async () => {
    const btn = $('printBtn');
    btn.disabled = true;
    btn.textContent = '전송 중입니다';
    $('printStatus').className = 'status';
    $('printStatus').textContent = '데이터를 Python 서버로 보냅니다';
    try {
        const base = $('apiBase').value.replace(/\/$/, '');
        const payload = {
            text: $('recognized').value,
            braille: brailleCells.map(x => x.bits),
            cells: brailleCells.map(x => ({
                character: x.source || null, dots: Array.from({ length: 6 }, (_, i) => !! (x.bits & (1 << i)))
            }))
        };
        const port = $('serialPort').value.trim();
        if (port)
            payload.port = port;
        const res = await fetch(base + '/api/print', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok)
            throw Error(`서버 응답 ${res.status}`);
        const data = await res.json().catch(() => ({}));
        $('printStatus').className = 'status ok'
        $('printStatus').textContent = data.message || 'Arduino로 전송했습니다. 점자 디스플레이를 확인해 주세요.';
        $('step3').classList.add('active');
    }
    catch (err) {
        $('printStatus').className = 'status error';
        $('printStatus').textContent = `출력 요청 실패: ${err.message}.
                                        Python 서버의 /api/print 연결과 Arduino 포트를 확인해 주세요.`;
    }
    finally {
        btn.disabled = !$('recognized').value.trim();
        btn.textContent = '디스플레이에 출력';
    }
};
render(); // 새로고침

const $ = id => document.getElementById(id); // document.getElementById()를 $로 축약

const DELAYTIME = 1500;

let selectedFile = null; // 이미지 파일 저장용 변수
let brailleCells = []; // 점자 셀 목록
let inputTimer = null; // 음성 안내 모드에서 마지막 입력 후 경과한 시간

// 문자열을 점자 패턴으로 연결하는 표
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
            inNum = false; // 이게 뭐시여 시방
            continue;
        }
        // 대문자일 경우
        if (/[A-Z]/.test(ch))
            out.push({ ch: '⠠', bits: cap, source: '' }); // 대문자 점자 추가
        // 숫자일 경우
        if (/[0-9]/.test(ch) && !inNum) {
            out.push({ ch: '⠼', bits: num, source: '' }); // 숫자 점자 추가
            inNum = true;
        }
        // 숫자가 아니면
        if (!/[0-9]/.test(ch))
            inNum = false;

        const bits = map[c];

        // 이게 뭐시여 시방
        if (bits !== undefined)
            out.push({ ch, bits, source: ch });
    }

    return out; // 저장된 결과물 반환
}

// 점자를 화면에 표시할 HTML 작성
function dots(bits) {
    // Braille bit order is vertical by column (dots 1–3, then 4–6),
    // while the CSS grid fills cells row by row. Reorder to match the grid.
    return [0, 3, 1, 4, 2, 5].map(
        (n) => {
            const on = !!(bits & (1 << n));
            return `<i class="dot ${on ? 'on' : ''}"></i>`
        }
    ).join('');
}

// 문자열을 읽여 화면에 갱신
// !!! 문자열을 지울 시 갱신이 제대로 되지 않는 문제 있음 !!! (버튼을 통해서는 작동함)
function render() {
    const txt = $('recognized').value;
    $('charCount').textContent = `${txt.length}자`; // 글자 수 표시
    brailleCells = enc(txt); // enc를 호출해 점자 생성
    const vis = brailleCells.map(x => String.fromCharCode(0x2800 + x.bits)).join('');
    $('brailleText').textContent = vis; // 점자 미리보기에 변환된 점자 표시
    $('empty').style.display = txt.trim() ? 'none' : 'block';
    $('printBtn').disabled = !txt.trim();
    $('cells').innerHTML = brailleCells.slice(0, 100).map(x =>
        `<span class="cell"><span class="dots">${dots(x.bits)}</span>${x.source || '기호'}</span>`
    ).join('');
    $('step2').classList.toggle('active', !!selectedFile || !!txt.trim());
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

$('file').addEventListener('change', e => setFile(e.target.files[0]));
['dragenter', 'dragover'].forEach(ev => $('drop').addEventListener(ev, e => {
    e.preventDefault();
    $('drop').classList.add('over');
}));
['dragleave', 'drop'].forEach(ev => $('drop').addEventListener(ev, e => {
    e.preventDefault();
    $('drop').classList.remove('over');
}));
$('drop').addEventListener('drop', e => setFile(e.dataTransfer.files[0]));
$('clearBtn').onclick = () => {
    selectedFile = null; $('file').value = '';
    $('preview').removeAttribute('src');
    $('preview').style.display = 'none';
    $('dropContent').style.display = 'block';
    $('recognizeBtn').disabled = true;
    $('clearBtn').disabled = true;
    $('ocrStatus').textContent = '';
    $('step1').classList.remove('active');
};
$('recognized').addEventListener('input', () => {
    if (!$('blindMode').checked) {
        render();
        return;
    }
    clearTimeout(inputTimer);
    $('ocrStatus').className = 'status';
    $('ocrStatus').textContent = '입력을 멈추면 소리내서 읽은 후 점자로 변환합니다.';
    inputTimer = setTimeout(finishBlindInput, DELAYTIME) });
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
    $('convertBtn').onclick = () => {
        clearTimeout(inputTimer);
        render();
        if ($('recognized').value.trim())
            toast('미리보기를 업데이트합니다.');
        else toast('먼저 영문을 입력하거나 인식해 주세요.');
    };
$('recognizeBtn').onclick = async () => {
    if (!selectedFile)
        return;
    const btn = $('recognizeBtn');
    btn.disabled = true;
    btn.textContent = '인식 중입니다.';
    $('ocrStatus').className = 'status';
    $('ocrStatus').textContent = 'Python 서버에 이미지를 보냅니다.';
    // 예외처리
    try {
        const form = new FormData();
        form.append('image', selectedFile);
        const base = $('apiBase').value.replace(/\/$/, '');
        const res = await fetch(base + '/api/recognize', { method: 'POST', body: form });
        if (!res.ok)
            throw Error(`서버 응답 ${res.status}`); // 서버 응답 없음
        const data = await res.json();
        const value = data.text ?? data.recognized_text ?? data.result;
        if (typeof value !== 'string')
            throw Error('응답에 text 필드가 없습니다.'); // text 없음
        $('recognized').value = value;
        if ($('blindMode').checked) {
            clearTimeout(inputTimer);
            $('ocrStatus').className = 'status';
            $('ocrStatus').textContent = 'OCR이 완료되었습니다. 잠시 후 인식된 영문을 읽고 점자로 변환합니다.';
            inputTimer = setTimeout(finishBlindInput, DELAYTIME);
        }
        else {
            render();
            $('ocrStatus').className = 'status ok';
            $('ocrStatus').textContent = '인식이 완료되었습니다. 결과를 확인하고 필요한 부분을 수정하세요.';
        }
    }
    // 예외 발생 시
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

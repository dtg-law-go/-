# 동탄국제고 학생청원 — 실제 공동 게시판

이 프로젝트는 Supabase를 이용해 여러 학생이 같은 안건·추천·공지 데이터를 공유하는 운영형 버전입니다.

## 1. Supabase 프로젝트 생성

1. Supabase Dashboard에서 새 프로젝트를 만듭니다.
2. SQL Editor에서 `supabase_setup.sql` 전체를 실행합니다.
3. Authentication → Providers → Email을 활성화합니다.
4. 실제 학교 이메일 인증을 사용하려면 Confirm email을 켭니다.
5. Project Settings → API에서 Project URL과 publishable/anon key를 확인합니다.
6. `config.js`에 두 값을 입력합니다. **service_role key는 절대 넣지 마세요.**

## 2. 관리자 만들기

1. 사이트에서 `2510203@dtg.hs.kr` 계정으로 가입합니다.
2. 이메일 인증 후 Supabase SQL Editor에서 실행합니다.

```sql
update public.profiles
set role='admin'
where email='2510203@dtg.hs.kr';
```

비밀번호는 사이트 코드에 저장하지 않습니다. 가입할 때 관리자 계정의 비밀번호를 설정하세요. 기존에 정한 `dtg.request.go`를 사용할 수는 있지만, 실제 운영에서는 더 긴 고유 비밀번호와 2단계 인증을 권장합니다.

## 3. Vercel 배포

저장소 루트에 다음 파일이 바로 있어야 합니다.

- `index.html`
- `styles.css`
- `app.js`
- `config.js`
- `vercel.json`

GitHub 저장소에 올리고 Vercel에서 Framework Preset을 `Other`로 선택해 배포합니다. Build Command와 Output Directory는 비워 둡니다.

## 4. Supabase Auth URL 설정

Authentication → URL Configuration에서:

- Site URL: 실제 Vercel 주소
- Redirect URLs: `https://내주소.vercel.app/**`

를 등록합니다.

## 5. 실제 운영 전 확인

- 학교 이메일이 실제로 메일을 받을 수 있는지
- 학생 가입 정보의 학번·이름이 사실인지 확인할 절차
- 개인정보 수집·이용 고지와 보관 기간
- 관리자 계정의 강한 비밀번호 및 2단계 인증
- 정기 백업과 관리자 변경 기록
- 학교의 공식 승인

## 보안 구조

- 일반 이용자는 발의자·추천인의 개인정보를 조회할 수 없습니다.
- 관리자는 RLS와 security-definer RPC를 통해서만 개인정보를 조회합니다.
- 추천은 `(petition_id, user_id)` UNIQUE 제약으로 DB에서 한 번만 허용됩니다.
- 20번째 추천이 입력되면 DB 트리거가 상태를 `검토대상`으로 바꿉니다.
- 관리자 답변은 자동 생성되지 않습니다.
- 관리자 권한은 HTML 비밀번호 비교가 아니라 `profiles.role='admin'`으로 판정합니다.

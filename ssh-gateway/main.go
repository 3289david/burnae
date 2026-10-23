// burnae-ssh-gateway: ssh burnae.kr로 접속하면 대시보드에서 발급한 1회용 코드로 로그인하고,
// 소유한 서버 목록을 보면서 시작/정지/재시작할 수 있는 작은 관리 콘솔.
// 실제 서버 데이터는 전부 burnae 앱의 내부 API(/api/internal/ssh-gateway/*)를 통해 가져온다 —
// 이 데몬은 상태를 들고 있지 않고 매번 조회한다.
package main

import (
	"bytes"
	"crypto/ed25519"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"
)

type config struct {
	listenAddr    string
	apiBaseURL    string
	internalSecret string
	hostKeyPath   string
}

func loadConfig() config {
	c := config{
		listenAddr:     getEnv("GATEWAY_LISTEN_ADDR", ":22"),
		apiBaseURL:     getEnv("GATEWAY_API_BASE_URL", "http://127.0.0.1:8000"),
		internalSecret: os.Getenv("INTERNAL_API_SECRET"),
		hostKeyPath:    getEnv("GATEWAY_HOST_KEY_PATH", "/etc/burnae/ssh-gateway-hostkey"),
	}
	if c.internalSecret == "" {
		log.Fatal("INTERNAL_API_SECRET이 설정되지 않았습니다")
	}
	return c
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

type apiServer struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Status     string `json:"status"`
	CanControl bool   `json:"canControl"`
}

type apiClient struct {
	baseURL string
	secret  string
	http    *http.Client
}

func (c *apiClient) verifyCode(code string) (userID, userName string, ok bool, err error) {
	body, _ := json.Marshal(map[string]string{"code": code})
	res, err := c.post("/api/internal/ssh-gateway/verify", body)
	if err != nil {
		return "", "", false, err
	}
	defer res.Body.Close()
	var out struct {
		Valid    bool   `json:"valid"`
		UserID   string `json:"userId"`
		UserName string `json:"userName"`
	}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return "", "", false, err
	}
	return out.UserID, out.UserName, out.Valid, nil
}

func (c *apiClient) listServers(userID string) ([]apiServer, error) {
	req, _ := http.NewRequest("GET", c.baseURL+"/api/internal/ssh-gateway/servers?userId="+userID, nil)
	req.Header.Set("x-internal-secret", c.secret)
	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	var servers []apiServer
	if err := json.NewDecoder(res.Body).Decode(&servers); err != nil {
		return nil, err
	}
	return servers, nil
}

func (c *apiClient) power(userID, serverID, signal string) error {
	body, _ := json.Marshal(map[string]string{"userId": userID, "serverId": serverID, "signal": signal})
	res, err := c.post("/api/internal/ssh-gateway/power", body)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return fmt.Errorf("power action failed: %d", res.StatusCode)
	}
	return nil
}

func (c *apiClient) post(path string, body []byte) (*http.Response, error) {
	req, err := http.NewRequest("POST", c.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-internal-secret", c.secret)
	return c.http.Do(req)
}

func main() {
	cfg := loadConfig()
	client := &apiClient{baseURL: cfg.apiBaseURL, secret: cfg.internalSecret, http: &http.Client{Timeout: 10 * time.Second}}

	hostKey, err := loadOrCreateHostKey(cfg.hostKeyPath)
	if err != nil {
		log.Fatalf("호스트 키 준비 실패: %v", err)
	}

	sshConfig := &ssh.ServerConfig{
		PasswordCallback: func(conn ssh.ConnMetadata, password []byte) (*ssh.Permissions, error) {
			code := strings.TrimSpace(string(password))
			userID, userName, ok, err := client.verifyCode(code)
			if err != nil {
				log.Printf("코드 확인 실패: %v", err)
				return nil, fmt.Errorf("로그인 확인 중 오류가 발생했습니다")
			}
			if !ok {
				return nil, fmt.Errorf("코드가 올바르지 않거나 만료됐습니다")
			}
			return &ssh.Permissions{
				Extensions: map[string]string{"userId": userID, "userName": userName},
			}, nil
		},
	}
	sshConfig.AddHostKey(hostKey)

	listener, err := net.Listen("tcp", cfg.listenAddr)
	if err != nil {
		log.Fatalf("리슨 실패 (%s): %v", cfg.listenAddr, err)
	}
	log.Printf("burnae-ssh-gateway listening on %s", cfg.listenAddr)

	for {
		nConn, err := listener.Accept()
		if err != nil {
			log.Printf("accept 실패: %v", err)
			continue
		}
		go handleConn(nConn, sshConfig, client)
	}
}

func handleConn(nConn net.Conn, sshConfig *ssh.ServerConfig, client *apiClient) {
	defer nConn.Close()
	sshConn, chans, reqs, err := ssh.NewServerConn(nConn, sshConfig)
	if err != nil {
		return
	}
	defer sshConn.Close()
	go ssh.DiscardRequests(reqs)

	userID := sshConn.Permissions.Extensions["userId"]
	userName := sshConn.Permissions.Extensions["userName"]

	for newChannel := range chans {
		if newChannel.ChannelType() != "session" {
			newChannel.Reject(ssh.UnknownChannelType, "세션만 지원합니다")
			continue
		}
		channel, requests, err := newChannel.Accept()
		if err != nil {
			continue
		}
		go func() {
			defer channel.Close()
			for req := range requests {
				switch req.Type {
				case "shell", "pty-req", "exec":
					if req.WantReply {
						req.Reply(true, nil)
					}
				default:
					if req.WantReply {
						req.Reply(false, nil)
					}
				}
			}
		}()
		go runMenu(channel, client, userID, userName)
	}
}

type termIO struct {
	io.ReadWriter
}

func (t *termIO) writeLine(s string) {
	t.Write([]byte(s + "\r\n"))
}

// 실제 pty를 만들지 않고 채널을 그냥 바이트 스트림으로 쓴다 — 로컬 echo가 없어서 직접
// 입력 문자를 되돌려 쓰고, backspace/엔터만 최소한으로 처리하는 단순 라인 리더다.
func (t *termIO) readLine() (string, error) {
	var buf []byte
	tmp := make([]byte, 1)
	for {
		n, err := t.Read(tmp)
		if n == 0 || err != nil {
			return "", err
		}
		b := tmp[0]
		switch b {
		case '\r', '\n':
			t.Write([]byte("\r\n"))
			return strings.TrimSpace(string(buf)), nil
		case 127, 8: // backspace/delete
			if len(buf) > 0 {
				buf = buf[:len(buf)-1]
				t.Write([]byte("\b \b"))
			}
		case 3: // Ctrl-C
			return "", io.EOF
		default:
			buf = append(buf, b)
			t.Write([]byte{b})
		}
	}
}

func statusLabel(status string) string {
	switch status {
	case "RUNNING":
		return "온라인"
	case "STOPPED":
		return "오프라인"
	case "STARTING":
		return "시작 중"
	case "STOPPING":
		return "정지 중"
	case "PROVISIONING":
		return "생성 중"
	case "SUSPENDED":
		return "정지됨(결제 필요)"
	default:
		return status
	}
}

func runMenu(channel ssh.Channel, client *apiClient, userID, userName string) {
	t := &termIO{channel}
	t.writeLine(fmt.Sprintf("환영합니다, %s님. burnae.kr 서버 관리 콘솔입니다.", userName))

	for {
		servers, err := client.listServers(userID)
		if err != nil {
			t.writeLine("서버 목록을 가져오지 못했습니다: " + err.Error())
			return
		}
		if len(servers) == 0 {
			t.writeLine("아직 만든 서버가 없어요. 대시보드에서 먼저 만들어주세요.")
			return
		}

		t.writeLine("")
		t.writeLine("내 서버:")
		for i, s := range servers {
			t.writeLine(fmt.Sprintf("  %d) %-24s [%s]", i+1, s.Name, statusLabel(s.Status)))
		}
		t.writeLine("  q) 종료")
		t.Write([]byte("번호 선택: "))

		input, err := t.readLine()
		if err != nil {
			return
		}
		if input == "q" || input == "exit" {
			return
		}
		idx, err := strconv.Atoi(input)
		if err != nil || idx < 1 || idx > len(servers) {
			t.writeLine("올바른 번호를 입력해주세요.")
			continue
		}
		server := servers[idx-1]
		if !serverSubmenu(t, client, userID, server) {
			return
		}
	}
}

// true면 상위 메뉴로 돌아가고, false면 연결을 끊는다(q 입력 시)
func serverSubmenu(t *termIO, client *apiClient, userID string, server apiServer) bool {
	for {
		t.writeLine("")
		t.writeLine(fmt.Sprintf("[%s] 상태: %s", server.Name, statusLabel(server.Status)))
		t.writeLine("  1) 시작    2) 정지    3) 재시작")
		t.writeLine("  b) 뒤로    q) 종료")
		t.Write([]byte("선택: "))

		input, err := t.readLine()
		if err != nil {
			return false
		}
		switch input {
		case "b", "back":
			return true
		case "q", "exit":
			return false
		case "1", "2", "3":
			signal := map[string]string{"1": "start", "2": "stop", "3": "restart"}[input]
			if err := client.power(userID, server.ID, signal); err != nil {
				t.writeLine("실패: " + err.Error())
			} else {
				t.writeLine("요청했어요 — 잠시 후 상태가 바뀝니다.")
			}
		default:
			t.writeLine("올바른 선택지를 입력해주세요.")
		}
	}
}

func loadOrCreateHostKey(path string) (ssh.Signer, error) {
	if data, err := os.ReadFile(path); err == nil {
		return ssh.ParsePrivateKey(data)
	}
	_, priv, err := ed25519.GenerateKey(nil)
	if err != nil {
		return nil, err
	}
	block, err := ssh.MarshalPrivateKey(priv, "")
	if err != nil {
		return nil, err
	}
	pemBytes := pem.EncodeToMemory(block)
	if err := os.MkdirAll("/etc/burnae", 0755); err != nil {
		return nil, err
	}
	if err := os.WriteFile(path, pemBytes, 0600); err != nil {
		return nil, err
	}
	return ssh.ParsePrivateKey(pemBytes)
}

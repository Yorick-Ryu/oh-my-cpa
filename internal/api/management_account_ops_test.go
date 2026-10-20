package api

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
)

func TestAccountOpsFacadeProjectsPrivateResponses(t *testing.T) {
	client, baseURL, recorder := startAuthFilesTestServer(t, "management-secret-value", func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/v8/management/account-ops/") {
			w.WriteHeader(404)
			return
		}
		if r.URL.Path == "/v8/management/account-ops/jobs" {
			if r.Header.Get("Idempotency-Key") != "synthetic-job-key" {
				t.Error("idempotency key not forwarded")
			}
			w.WriteHeader(202)
		}
		_, _ = fmt.Fprint(w, `{"worker_available":true,"password":"secret-password-fixture","totp":"secret-totp-fixture","token":"secret-token-fixture","items":[{"id":"0123456789abcdef0123456789abcdef","kind":"record","state":"succeeded","password":"nested-password-fixture"}],"rows":[{"index":0,"email":"fixture+alias@example.com","has_credentials":true,"secrets":{"password":"preview-secret-fixture"}}]}`)
	})
	for _, path := range []string{"/capabilities", "/records"} {
		response, raw := doJSON(t, client, http.MethodGet, baseURL+"/omc/api/v1/management/account-ops"+path, "")
		if response.StatusCode != 200 {
			t.Fatalf("status=%d body=%s", response.StatusCode, raw)
		}
		for _, secret := range []string{"secret-password-fixture", "secret-totp-fixture", "secret-token-fixture", "nested-password-fixture", "preview-secret-fixture"} {
			if strings.Contains(string(raw), secret) {
				t.Fatalf("facade leaked %s", secret)
			}
		}
	}
	request, _ := http.NewRequest(http.MethodPost, baseURL+"/omc/api/v1/management/account-ops/jobs", strings.NewReader(`{"kind":"record"}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Idempotency-Key", "synthetic-job-key")
	response, err := client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != 202 {
		t.Errorf("submission status=%d", response.StatusCode)
	}
	if recorder.count(http.MethodPost, "/v8/management/account-ops/jobs") != 1 {
		t.Error("job not forwarded once")
	}
	denied, raw := doJSON(t, client, http.MethodGet, baseURL+"/omc/api/v1/management/account-ops/credentials", "")
	if denied.StatusCode != 404 {
		t.Fatalf("unknown route status=%d body=%s", denied.StatusCode, raw)
	}
	unauthenticated, err := http.Get(baseURL + "/omc/api/v1/management/account-ops/capabilities")
	if err != nil {
		t.Fatal(err)
	}
	defer unauthenticated.Body.Close()
	if unauthenticated.StatusCode != 401 {
		t.Fatalf("unauthenticated status=%d", unauthenticated.StatusCode)
	}
}

func TestAccountOpsFacadeDoesNotExposeUpstreamFailure(t *testing.T) {
	client, baseURL, _ := startAuthFilesTestServer(t, "management-secret-value", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(503)
		_, _ = fmt.Fprint(w, `{"error":"private-upstream-payload"}`)
	})
	response, raw := doJSON(t, client, http.MethodGet, baseURL+"/omc/api/v1/management/account-ops/capabilities", "")
	if response.StatusCode != 503 || strings.Contains(string(raw), "private-upstream-payload") {
		t.Fatalf("status=%d body=%s", response.StatusCode, raw)
	}
}

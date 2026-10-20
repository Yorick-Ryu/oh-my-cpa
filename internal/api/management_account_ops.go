package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"

	"github.com/oh-my-cpa/oh-my-cpa/internal/cpa/management"
)

// This projection deliberately contains no raw text, token, password, TOTP,
// browser URL, logfile path, arbitrary metadata or credential ciphertext field.
type accountOpsChild struct {
	RowIndex int            `json:"row_index"`
	Job      *accountOpsJob `json:"job"`
}
type accountOpsOrder struct {
	OrderID     *string `json:"order_id"`
	AmountCents *int64  `json:"amount_cents"`
	ExpiresAt   *string `json:"expires_at"`
}
type accountOpsNotificationSummary struct {
	Pending   int      `json:"pending"`
	NextRetry *float64 `json:"next_retry"`
}
type accountOpsJob struct {
	Children          []accountOpsChild   `json:"children,omitempty"`
	ID                string              `json:"id,omitempty"`
	ParentID          string              `json:"parent_id,omitempty"`
	Instance          string              `json:"instance,omitempty"`
	AccountID         string              `json:"account_id,omitempty"`
	Kind              string              `json:"kind,omitempty"`
	Source            string              `json:"source,omitempty"`
	State             string              `json:"state,omitempty"`
	Phase             string              `json:"phase,omitempty"`
	Reason            string              `json:"reason,omitempty"`
	Created           float64             `json:"created,omitempty"`
	Updated           float64             `json:"updated,omitempty"`
	CancelRequested   bool                `json:"cancel_requested"`
	AllowedActions    []string            `json:"allowed_actions,omitempty"`
	Snapshot          *accountOpsSnapshot `json:"snapshot,omitempty"`
	CredentialVersion *int64              `json:"credential_version,omitempty"`
}
type accountOpsPreferences struct {
	Instance    string `json:"instance"`
	Websockets  bool   `json:"websockets"`
	Priority    int    `json:"priority"`
	Model       string `json:"model"`
	Effort      string `json:"effort"`
	ProxyPolicy string `json:"proxy_policy"`
	AutoEnroll  bool   `json:"auto_enroll"`
}
type accountOpsSnapshot struct {
	Order             *accountOpsOrder      `json:"order,omitempty"`
	Preferences       accountOpsPreferences `json:"preferences"`
	PreferenceVersion int64                 `json:"preference_version"`
	AccountVersion    *int64                `json:"account_version"`
	QualitySkip       string                `json:"quality_skip,omitempty"`
}
type accountOpsItem struct {
	accountOpsJob
	Cursor          int64    `json:"cursor,omitempty"`
	JobID           string   `json:"job_id,omitempty"`
	Time            float64  `json:"time,omitempty"`
	EvidenceID      string   `json:"evidence_id,omitempty"`
	Email           string   `json:"email,omitempty"`
	Provider        string   `json:"provider,omitempty"`
	Workspace       string   `json:"workspace,omitempty"`
	HasCredentials  bool     `json:"has_credentials"`
	Version         int64    `json:"version,omitempty"`
	Enabled         bool     `json:"enabled"`
	Running         *bool    `json:"running"`
	Owner           string   `json:"owner,omitempty"`
	IntervalSeconds int      `json:"interval_seconds,omitempty"`
	LastRun         *float64 `json:"last_run,omitempty"`
	NextRun         *float64 `json:"next_run,omitempty"`
}
type accountOpsPreview struct {
	Index          int      `json:"index"`
	Email          string   `json:"email"`
	OrderID        *string  `json:"order_id"`
	AmountCents    *int64   `json:"amount_cents"`
	ExpiresAt      *string  `json:"expires_at"`
	Issues         []string `json:"issues"`
	HasCredentials bool     `json:"has_credentials"`
}
type accountOpsLegacySource struct {
	Kind                 string   `json:"kind"`
	Available            bool     `json:"available"`
	Reason               string   `json:"reason,omitempty"`
	Legacy               bool     `json:"legacy"`
	TimePrecision        string   `json:"time_precision,omitempty"`
	RetainedResults      int      `json:"retained_results,omitempty"`
	LastRun              *float64 `json:"last_run,omitempty"`
	PerCredentialLimit   int      `json:"per_credential_limit,omitempty"`
	Accounts             *int     `json:"accounts,omitempty"`
	WaitingHuman         int      `json:"waiting_human,omitempty"`
	Attempts             int      `json:"attempts,omitempty"`
	PendingNotifications int      `json:"pending_notifications"`
	Unavailable          int      `json:"unavailable,omitempty"`
	Unauthorized         int      `json:"unauthorized,omitempty"`
	Skipped              *int     `json:"skipped,omitempty"`
	RetainedRuns         int      `json:"retained_runs,omitempty"`
	BoundedTail          bool     `json:"bounded_tail,omitempty"`
}
type accountOpsResponse struct {
	Notifications *accountOpsNotificationSummary `json:"notifications,omitempty"`
	accountOpsJob
	ProtocolVersion int                      `json:"protocol_version,omitempty"`
	WorkerAvailable bool                     `json:"worker_available"`
	History         bool                     `json:"history"`
	Imports         bool                     `json:"imports"`
	RecordOnly      bool                     `json:"record_only"`
	Browser         bool                     `json:"browser"`
	Proxy           bool                     `json:"proxy"`
	HumanTakeover   bool                     `json:"human_takeover"`
	ScheduleOwner   string                   `json:"schedule_owner,omitempty"`
	Synthetic       bool                     `json:"synthetic"`
	DraftID         string                   `json:"draft_id,omitempty"`
	ExpiresAt       float64                  `json:"expires_at,omitempty"`
	Rows            []accountOpsPreview      `json:"rows,omitempty"`
	Items           []accountOpsItem         `json:"items,omitempty"`
	NextCursor      json.RawMessage          `json:"next_cursor,omitempty"`
	HasMore         bool                     `json:"has_more"`
	Version         int64                    `json:"version,omitempty"`
	Value           *accountOpsPreferences   `json:"value,omitempty"`
	HasCredentials  bool                     `json:"has_credentials"`
	Sources         []accountOpsLegacySource `json:"sources,omitempty"`
	Schedules       []accountOpsItem         `json:"schedules,omitempty"`
	HistoryComplete bool                     `json:"history_complete"`
	ObservedAt      float64                  `json:"observed_at,omitempty"`
}

var accountOpsRoute = regexp.MustCompile(`^/(capabilities|monitor|records|accounts|schedules(/(quality_inspection|health_scan|auto_reauth_scan))?|imports/preview|jobs|jobs/[a-f0-9]{32}(/(events|cancel|resume))?|preferences/[a-zA-Z0-9_.-]{1,64}|accounts/[a-f0-9]{32}/credentials)$`)

var accountOpsID = regexp.MustCompile(`^[a-zA-Z0-9_.-]{1,128}$`)

func (h *Handler) accountOps(writer http.ResponseWriter, request *http.Request) {
	writer.Header().Set("Cache-Control", "no-store")
	marker := "/management/account-ops"
	position := strings.Index(request.URL.Path, marker)
	if position < 0 {
		writeError(writer, http.StatusNotFound, "invalid account operations route")
		return
	}
	path := request.URL.Path[position+len(marker):]
	if !accountOpsRoute.MatchString(path) {
		writeError(writer, http.StatusNotFound, "invalid account operations route")
		return
	}
	var payload json.RawMessage
	if request.Method != http.MethodGet {
		if err := decodeManagementJSON(writer, request, 300000, &payload); err != nil {
			return
		}
	}
	key := request.Header.Get("Idempotency-Key")
	if key != "" && !accountOpsID.MatchString(key) {
		writeError(writer, http.StatusBadRequest, "invalid idempotency key")
		return
	}
	client, ok := h.managementClientOrError(writer, request)
	if !ok {
		return
	}
	// The audit contains only a fixed protocol route, never the import body or
	// credential input. Even previews persist private drafts, so they are audited.
	if request.Method != http.MethodGet {
		if err := h.recordAudit(request, "account_ops.request", "account_ops", path, "attempt", map[string]any{"method": request.Method}); err != nil {
			writeError(writer, http.StatusInternalServerError, "audit log failure; account operation aborted")
			return
		}
	}
	var response accountOpsResponse
	meta, err := client.AccountOps(request.Context(), request.Method, path, request.URL.RawQuery, key, payload, &response)
	outcome := "success"
	if err != nil {
		outcome = "failure"
	}
	if request.Method != http.MethodGet {
		if auditErr := h.recordAudit(request, "account_ops.request", "account_ops", path, outcome, map[string]any{"status": meta.StatusCode}); auditErr != nil {
			writeError(writer, http.StatusInternalServerError, "audit log failure after account operation")
			return
		}
	}
	if err != nil {
		var httpErr *management.HTTPError
		status := http.StatusServiceUnavailable
		reason := "unavailable"
		if errors.As(err, &httpErr) {
			switch httpErr.StatusCode {
			case 400, 404, 409, 410, 413, 415:
				status = httpErr.StatusCode
			}
			var failure struct {
				Error string `json:"error"`
			}
			if json.Unmarshal([]byte(httpErr.Body), &failure) == nil {
				switch failure.Error {
				case "invalid_input", "conflict", "locked", "draft_expired", "configuration_changed":
					reason = failure.Error
				}
			}
		}
		writeError(writer, status, reason)
		return
	}
	// Cursor is a scalar contract, not an unbounded JSON escape hatch.
	if len(response.NextCursor) > 0 && string(response.NextCursor) != "null" {
		var numeric int64
		var identifier string
		if json.Unmarshal(response.NextCursor, &numeric) != nil && (json.Unmarshal(response.NextCursor, &identifier) != nil || !accountOpsID.MatchString(identifier)) {
			response.NextCursor = nil
		}
	}
	writeJSON(writer, meta.StatusCode, response)
}

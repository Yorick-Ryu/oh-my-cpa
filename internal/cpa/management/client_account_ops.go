package management

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
)

var accountOpsEndpoint = regexp.MustCompile(`^/(capabilities|monitor|records|accounts|schedules(/(quality_inspection|health_scan|auto_reauth_scan))?|imports/preview|jobs|jobs/[a-f0-9]{32}(/(events|cancel|resume))?|preferences/[a-zA-Z0-9_.-]{1,64}|accounts/[a-f0-9]{32}/credentials)$`)

// AccountOps uses only the fixed selected instance, never a browser-provided URL.
// The facade owns the response projection and the pre-operation audit gate.
func (c *Client) AccountOps(ctx context.Context, method, path, query, idempotencyKey string, body json.RawMessage, output any) (ResponseMeta, error) {
	if !accountOpsEndpoint.MatchString(path) || (method != http.MethodGet && method != http.MethodPost && method != http.MethodPut) {
		return ResponseMeta{}, errors.New("invalid account operations route")
	}
	endpoint := "/account-ops" + path
	if query != "" {
		endpoint += "?" + query
	}
	request, err := c.newRequest(ctx, method, endpoint, bytes.NewReader(body), "application/json")
	if err != nil {
		return ResponseMeta{}, err
	}
	if idempotencyKey != "" {
		request.Header.Set("Idempotency-Key", idempotencyKey)
	}
	return c.do(request, output)
}

/**
 * ATSHManager — handles ELM327 header switching for Toyota proprietary PIDs.
 *
 * The ELM327 ATSH command sets the CAN arbitration ID (header) so that
 * the request is routed to the correct ECU. This manager tracks the
 * currently active header and only sends ATSH when a switch is needed,
 * minimizing unnecessary bus traffic.
 *
 * After a header switch, the manager also sends ATFCSH (flow control
 * set header) and ATFCSD (flow control set data) if needed for multi-frame
 * responses, then restores defaults when switching back to standard PIDs.
 */
export class ATSHManager {
  /**
   * @param {import('./elm327.js').ELM327} elm
   */
  constructor(elm) {
    /** @type {import('./elm327.js').ELM327} */
    this._elm = elm;
    /** @type {string | null} Currently active ATSH header, null = default (standard OBD) */
    this._currentHeader = null;
  }

  /**
   * Ensure the ELM327 header is set to the given ECU address.
   * Sends ATSH only if the header differs from the current one.
   * @param {string} header - ECU header, e.g. '7E2', '7E4', '7E0'.
   * @returns {Promise<void>}
   */
  async switchTo(header) {
    if (this._currentHeader === header) return;

    // Enable headers in response so we can see which ECU replied
    await this._elm.send('ATH1');
    // Set the transmit header
    await this._elm.send(`ATSH ${header}`);
    // Set flow control header to match (response address = request + 8)
    const fcHeader = (parseInt(header, 16) + 8).toString(16).toUpperCase();
    await this._elm.send(`ATFCSH ${fcHeader}`);

    this._currentHeader = header;
  }

  /**
   * Reset the header back to standard OBD2 defaults.
   * Call this when switching from Toyota PIDs back to standard PIDs.
   * @returns {Promise<void>}
   */
  async resetToDefault() {
    if (this._currentHeader === null) return;

    // Restore default header
    await this._elm.send('ATD');
    // Disable header display
    await this._elm.send('ATH0');

    this._currentHeader = null;
  }

  /**
   * Return the currently active header, or null if using defaults.
   * @returns {string | null}
   */
  get currentHeader() {
    return this._currentHeader;
  }
}

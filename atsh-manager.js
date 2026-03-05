/**
 * ATSHManager — handles ELM327 header switching for Toyota proprietary PIDs.
 *
 * The ELM327 ATSH command sets the CAN arbitration ID (header) so that
 * the request is routed to the correct ECU. This manager tracks the
 * currently active header and only sends ATSH when a switch is needed,
 * minimizing unnecessary bus traffic.
 *
 * ATH1 is set globally during init (config.js INIT_SEQUENCE) so that
 * response headers are always visible. This manager does NOT toggle
 * ATH0/ATH1 — headers stay on at all times for correct response parsing.
 *
 * After a header switch, the manager sends the full Flow Control trio:
 *   ATFCSH — FC header (= transmit header, because the FC frame is sent
 *            BY the tester TO the ECU, using the tester's CAN ID)
 *   ATFCSD 30 00 00 — FC data: ContinueToSend, BlockSize=0, SepTime=0
 *   ATFCSM 1 — Use user-defined FC settings from ATFCSD
 *
 * This ensures multi-frame ISO-TP responses (>7 bytes) are properly
 * flow-controlled for any Toyota ECU.
 *
 * Sources:
 *   - ELM327 AT command set (ATFCSH, ATFCSD, ATFCSM)
 *   - ISO 15765-2 Flow Control frame: FC_flag=0 (CTS), BS=0, STmin=0
 *   - Ircama/ELM327-emulator flow_control_fc_flag handling
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
   * Sends ATSH + full FC trio only if the header differs from the current one.
   * ATH1 is already on from init — no need to set it here.
   *
   * @param {string} txHeader - ECU request header, e.g. '7E2', '7E4', '7E0'.
   * @param {string} [rxHeader] - ECU response header, e.g. '7EA', '7EC', '7E8'.
   *        Stored for documentation / future ATCRA filtering; not sent as a command.
   * @returns {Promise<void>}
   */
  async switchTo(txHeader, rxHeader) {
    if (this._currentHeader === txHeader) return;

    // Set the transmit header (CAN arbitration ID for requests)
    await this._elm.send(`ATSH ${txHeader}`);

    // Flow Control setup for multi-frame ISO-TP responses:
    // ATFCSH uses the tester TX header (same as ATSH), not ECU rxHeader.
    // Reason: in ISO-TP, FC is sent by the RECEIVER (tester) back to the
    // SENDER (ECU). Example flow 5F0->6F0 then FC 5F0 is documented here:
    // https://mechanics.stackexchange.com/questions/91169/flow-control-for-multiline-responses-for-custom-15765-4-can-messages-over-elm327
    // ISO-TP FC direction reference:
    // https://docs.kernel.org/networking/iso15765-2.html
    await this._elm.send(`ATFCSH ${txHeader}`);
    // FC data: 30 = ContinueToSend (fc_flag=0), 00 = BlockSize unlimited,
    //          00 = SeparationTime minimum (no delay between CFs)
    await this._elm.send('ATFCSD 30 00 00');
    // FC mode 1 = use user-defined header (ATFCSH) and data (ATFCSD)
    await this._elm.send('ATFCSM 1');

    this._currentHeader = txHeader;
  }

  /**
   * Reset the header back to standard OBD2 defaults.
   * Call this when switching from Toyota PIDs back to standard PIDs.
   * ATH1 stays on — standard PID parsers handle headers too.
   * Avoid ATD here because it resets global adapter state (headers/protocol/timing).
   * @returns {Promise<void>}
   */
  async resetToDefault() {
    if (this._currentHeader === null) return;

    // Restore functional broadcast addressing only.
    // Keeping ATH/ATAL/protocol/timing untouched prevents silent de-initialization.
    await this._elm.send('ATSH 7DF');

    this._currentHeader = null;
  }

  /**
   * Invalidate the cached header state.
   * Forces a full ATSH + FC re-send on the next switchTo() call.
   * Call this after a timeout or communication error to ensure the
   * adapter state is re-synchronized.
   */
  invalidate() {
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

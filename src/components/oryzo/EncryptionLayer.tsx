interface EncryptionLayerProps {
  /** True while the message side of the coaster faces up. */
  messageUp: boolean;
  onMessage: (text: string) => void;
  onFlip: () => void;
  /** Called when the field takes focus, so the coaster can turn message-side up for typing. */
  onEdit: () => void;
}

/**
 * "Smart flip encryption": type a message, it is stamped into the coaster's underside, and
 * flipping the coaster hides it. Reads --enc-in / --enc-out from the stage's scroll timeline.
 */
export function EncryptionLayer({ messageUp, onMessage, onFlip, onEdit }: EncryptionLayerProps) {
  return (
    <div className="oz-enc">
      <div className="oz-enc-main">
        <div className="oz-enc-header">
          <p className="oz-enc-tagline">Secure communications simplified</p>
          <h2 className="oz-enc-title">
            Smart flip
            <br />
            encryption
          </h2>
          <p className="oz-enc-desc">
            Write a message. Flip. Instantly secure - until
            <br />
            someone flips it back. Genius.
          </p>
        </div>
        <div className="oz-enc-field">
          <span className="oz-enc-line" />
          <span className="oz-enc-line" />
          <span className="oz-enc-line" />
          <span className="oz-enc-line" />
          <input
            type="text"
            aria-label="Message to stamp on the coaster"
            defaultValue="ORYZO"
            maxLength={10}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => onMessage(event.target.value)}
            onFocus={(event) => {
              event.target.select();
              onEdit();
            }}
          />
        </div>
        <button
          type="button"
          className={`oz-enc-button${messageUp ? "" : " is-active"}`}
          onClick={onFlip}
        >
          <span className="oz-enc-button-inner">
            <span>Encode Message</span>
            <span>Decode Message</span>
          </span>
        </button>
      </div>
    </div>
  );
}

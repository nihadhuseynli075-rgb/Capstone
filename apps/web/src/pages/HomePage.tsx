import { navigate } from "../app/router";

export function HomePage() {
  return (
    <div className="stack">
      <section className="hero">
        <p className="eyebrow">Grade 9 final exam prep</p>
        <h1>Practise the real exam, then find out exactly what to fix.</h1>
        <p className="lede">
          Build a mock test from past-paper questions, sit it start to finish, and get your score,
          your mistakes and the reason behind every one of them at the end.
        </p>
      </section>

      <section className="card-grid">
        <button type="button" className="action-card primary" onClick={() => navigate("/build")}>
          <span className="action-card-title">Create a mock test</span>
          <span className="action-card-body">
            Pick a subject and topics, choose a difficulty or set your own length and timer.
          </span>
        </button>

        <button type="button" className="action-card" onClick={() => navigate("/history")}>
          <span className="action-card-title">Test history</span>
          <span className="action-card-body">
            Every test you have taken, your best result so far, and the answers you got wrong.
          </span>
        </button>
      </section>

      <section className="note">
        <h2>Coming later</h2>
        <p>
          Friends and the community question board are planned for after the core test flow is
          finished and tested.
        </p>
      </section>
    </div>
  );
}

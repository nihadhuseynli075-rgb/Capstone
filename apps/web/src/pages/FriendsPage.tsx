export function FriendsPage() {
  return (
    <div className="stack">
      <section>
        <p className="eyebrow">ExamPeak</p>
        <h1>Friends</h1>
        <p className="lede">
          Add friends and compare your test progress.
        </p>
      </section>

      <section className="card">
        <h2>Add Friend</h2>

        <form
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <label>
            Friend email
            <input
              type="email"
              placeholder="Enter friend's email"
            />
          </label>

          <button type="submit">
            Add Friend
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Friend List</h2>

        <p>No friends added yet.</p>
      </section>
    </div>
  );
}
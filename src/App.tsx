import Dropzone from "./components/Dropzone";

function App() {
  return (
    <section className="section font-inter p-10">
      <div className="container">
        <h1 className="text-4xl font-bold bg-violet-500 text-white m-auto rounded-full p-3 w-fit">
          <i className="fa-brands fa-pix"></i> Montage
        </h1>
        <h2 className="title mt-14 text-2xl font-semibold">Upload Files</h2>
        <Dropzone className="p-16 mt-8 border-2 border-neutral-200" />
      </div>
    </section>
  );
}

export default App;

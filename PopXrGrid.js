import Pop from './PopEngine/PopEngine.js'
import FrameCounter_t from './PopEngine/FrameCounter.js'
import App_t from './RushGame.js'

let LastXrRenderTimeMs = null;


async function RenderLoop(Canvas,XrOnWaitForCallback)
{
	const RenderView = new Pop.Gui.RenderView(null,Canvas);
	const RenderContext = new Pop.Sokol.Context(RenderView);
	
	
	let App = new App_t();
	App.BindMouseCameraControls( RenderView );
		
	function GetXrRenderCommands()
	{
		LastXrRenderTimeMs = Pop.GetTimeNowMs();
		return App.GetXrRenderCommands(...arguments);
	}
			
	async function XrLoop(RenderContext,XrOnWaitForCallback)
	{
		const FrameCounter = new FrameCounter_t(`XR frame`);
		function OnXrRender()
		{
			FrameCounter.Add();
		}

		while ( true )
		{
			try
			{
				LastXrRenderTimeMs = null;
				const Device = await Pop.Xr.CreateDevice( RenderContext, GetXrRenderCommands, XrOnWaitForCallback );
				//	this needs updating
				Device.OnRender = OnXrRender;
			}
			catch(e)
			{
				console.error(`Failed to create xr ${e}`);
				await Pop.Yield(1*1000);
			}
		}
	}

	if ( XrOnWaitForCallback )
		XrLoop(RenderContext,XrOnWaitForCallback).catch(console.error);
	
	
	const FrameCounter = new FrameCounter_t(`Render`);
	
	while ( RenderView )
	{
		let Commands = [];
		try
		{
			Commands = App.GetDesktopRenderCommands(RenderContext,RenderView);
		}
		catch(e)
		{
			console.error(e);
			const ClearRed = ['SetRenderTarget',null,[1,0,0]];
			Commands.splice(0,0,ClearRed);
		}
		
		await RenderContext.Render(Commands);
		FrameCounter.Add();

		//	only intermediately render if xr is running
		//	todo: check time since render and "turn on" again if we havent XR rendered for a while
		if ( Pop.GetTimeNowMs() - LastXrRenderTimeMs > 2*1000 )
			LastXrRenderTimeMs = null;
		if ( LastXrRenderTimeMs )
			await Pop.Yield(10*1000);
	}
}


export default async function Bootup(XrOnWaitForCallback)
{
	await RenderLoop('Window',XrOnWaitForCallback);
}

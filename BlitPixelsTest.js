import Camera_t from './PopEngine/Camera.js'
import {CreateTranslationMatrix,Add3,Multiply3,Dot3,lerp,LengthSq3,Normalise3,Subtract3} from './PopEngine/Math.js'
import {CreateRandomImage} from './PopEngine/Images.js'
import {GetRandomColour} from './PopEngine/Colour.js'
import * as PopMath from './PopEngine/Math.js'
import Pop from './PopEngine/PopEngine.js'

import AssetManager from './PopEngine/AssetManager.js'
import {HasFetchFunction} from './PopEngine/AssetManager.js'
import {CreateBlitQuadGeometry} from './PopEngine/CommonGeometry.js'



async function CreateQuadTriangleBuffer(RenderContext)
{
	const Geometry = CreateBlitQuadGeometry();
	const TriangleIndexes = undefined;
	return RenderContext.CreateGeometry( Geometry, TriangleIndexes );
}

let PixelTestShaderName = null;

export default function GetBlitPixelTestRenderCommands(RenderContext,OutputTexture,VoxelBuffer,OccupancyMapSize)
{
	const Test = false;
	
	if ( !HasFetchFunction('Quad') )
	{
		AssetManager.RegisterAssetAsyncFetchFunction('Quad', CreateQuadTriangleBuffer );
	}
	if ( !PixelTestShaderName )
	{
		let VertFilename = 'BlitPixelsOccupancy.Vert.glsl';
		let FragFilename = 'BlitPixelsOccupancy.Frag.glsl';
		if ( Test )
		{
			 VertFilename = 'BlitPixelsTest.Vert.glsl';
			FragFilename = 'BlitPixelsTest.Frag.glsl';
		}
		PixelTestShaderName = AssetManager.RegisterShaderAssetFilename( FragFilename, VertFilename );
	}

	if ( !VoxelBuffer )
		return [];
	
	const w = OutputTexture.GetWidth();
	const h = OutputTexture.GetHeight();
	
	let PixelPositions = [];
	if ( Test )
	{
		//	instancing quads at each pixel 
		for ( let x=0;	x<w;	x++ )
			for ( let y=0;	y<h;	y++ )
				PixelPositions.push(x,y);
	}
	else
	{
		//	instancing for each position uv 
		PixelPositions = VoxelBuffer.PositionsTextureUvs;
	}
	PixelPositions = new Float32Array(PixelPositions);

	const Clear = [0,0,0,0];
	const ReadBack = true;
	const SetRenderTarget = ['SetRenderTarget',OutputTexture,Clear,ReadBack];
	
	//	render pixels
	const Geo = AssetManager.GetAsset('Quad',RenderContext);
	const Shader = AssetManager.GetAsset(PixelTestShaderName,RenderContext);
	
	const Uniforms = {};
	Uniforms.PixelPosition = PixelPositions;
	Uniforms.OutputTextureSize = [w,h];
	Uniforms.PositionsTexture = VoxelBuffer.PositionsTexture;
	Uniforms.OccupancyMapWorldMin = OccupancyMapSize.WorldMin;
	Uniforms.OccupancyMapWorldMax = OccupancyMapSize.WorldMax;
	
	const State = {};
	//	turning depth write off seems to make the texture not resolve before rendering left eye
	//	too slow?
	State.DepthWrite = true;
	State.DepthRead = false;
	State.BlendMode = 'Max';
	
	const DrawPixels = ['Draw',Geo,Shader,Uniforms,State];
	
	return [SetRenderTarget,DrawPixels];
}

